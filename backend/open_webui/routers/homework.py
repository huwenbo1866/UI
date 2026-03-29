import json
import logging
import os
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from open_webui.internal.db import get_session
from open_webui.models.files import Files
from open_webui.models.homework import (
    HomeworkCreateForm,
    HomeworkQuestionCreateForm,
    HomeworkSubmissionAnswerCreateForm,
    HomeworkSubmissionCreateForm,
    HomeworkQuestions,
    HomeworkSubmissionAnswers,
    HomeworkSubmissions,
    Homeworks,
)
from open_webui.models.users import UserModel
from open_webui.routers.pipelines import process_pipeline_inlet_filter
from open_webui.services.chapter_mindmap import update_chapter_mindmap_from_homework_results
from open_webui.utils.auth import get_verified_user
from open_webui.utils.chat import generate_chat_completion
from open_webui.utils.models import get_all_models
from open_webui.utils.task import get_task_model_id

log = logging.getLogger(__name__)

router = APIRouter()


DEFAULT_DIFFICULTY_CONFIG = {"easy": 5, "medium": 3, "hard": 2}
DEFAULT_QUESTION_TYPES = ["choice", "judge", "short_answer"]
SUPPORTED_FILE_EXTENSIONS = {".pdf", ".md", ".markdown", ".txt"}


class DifficultyConfig(BaseModel):
    easy: int = 5
    medium: int = 3
    hard: int = 2


class GenerateHomeworkForm(BaseModel):
    title: Optional[str] = None
    source_file_id: Optional[str] = None
    source_content: Optional[str] = None
    source_chapter_title: Optional[str] = None
    source_chapter_start_page: Optional[int] = None
    source_chapter_end_page: Optional[int] = None
    description: str = ""
    difficulty_config: DifficultyConfig = Field(default_factory=DifficultyConfig)
    question_types: list[str] = Field(default_factory=lambda: DEFAULT_QUESTION_TYPES.copy())
    model: Optional[str] = None


class AnswerItem(BaseModel):
    question_id: str
    answer: Optional[str] = None


class SubmitHomeworkForm(BaseModel):
    homework_id: str
    answers: list[AnswerItem] = Field(default_factory=list)
    model: Optional[str] = None


class ManualHomeworkQuestionItem(BaseModel):
    type: str = "short_answer"
    difficulty: str = "medium"
    question: str
    options: Optional[list[str]] = None
    answer: Optional[str] = ""
    analysis: Optional[str] = ""


class CreateHomeworkFromQuestionsForm(BaseModel):
    title: Optional[str] = None
    source_file_id: Optional[str] = None
    source_file: Optional[str] = None
    source_chapter_title: Optional[str] = None
    source_chapter_start_page: Optional[int] = None
    source_chapter_end_page: Optional[int] = None
    description: str = ""
    questions: list[ManualHomeworkQuestionItem] = Field(default_factory=list)


def _normalize_type(value: str) -> str:
    key = (value or "").strip().lower()
    mapping = {
        "choice": "choice",
        "mcq": "choice",
        "single_choice": "choice",
        "select": "choice",
        "选择题": "choice",
        "judge": "judge",
        "true_false": "judge",
        "boolean": "judge",
        "判断题": "judge",
        "short": "short_answer",
        "short_answer": "short_answer",
        "qa": "short_answer",
        "essay": "short_answer",
        "简答题": "short_answer",
    }
    return mapping.get(key, "short_answer")


def _normalize_difficulty(value: str) -> str:
    key = (value or "").strip().lower()
    mapping = {
        "easy": "easy",
        "simple": "easy",
        "简单": "easy",
        "medium": "medium",
        "normal": "medium",
        "中等": "medium",
        "hard": "hard",
        "difficult": "hard",
        "困难": "hard",
    }
    return mapping.get(key, "medium")


def _normalize_judge_value(value: Optional[str]) -> str:
    key = str(value or "").strip().lower()
    if key in {"true", "t", "yes", "1", "正确", "对"}:
        return "true"
    if key in {"false", "f", "no", "0", "错误", "错"}:
        return "false"
    return key


_CHOICE_PREFIX_PATTERN = re.compile(
    r"^\s*[\(\[（]?\s*([a-z])\s*[\)\]）\.\:、\-]\s*",
    re.IGNORECASE,
)


def _normalize_choice_value(value: Optional[str]) -> str:
    key = str(value or "").strip().lower()
    if not key:
        return ""
    if len(key) == 1 and "a" <= key <= "z":
        return key

    match = _CHOICE_PREFIX_PATTERN.match(key)
    if match:
        return match.group(1).lower()

    return key


def _resolve_choice_answer_key(value: Optional[str], options: list[str]) -> str:
    normalized = _normalize_choice_value(value)
    if len(normalized) == 1 and "a" <= normalized <= "z":
        return normalized

    raw = str(value or "").strip().lower()
    for idx, option in enumerate(options):
        option_text = option.strip().lower()
        if raw == option_text:
            return chr(ord("a") + idx)

        option_normalized = _normalize_choice_value(option)
        if normalized and normalized == option_normalized:
            if len(option_normalized) == 1 and "a" <= option_normalized <= "z":
                return option_normalized

    return normalized


def _is_choice_answer_correct(
    student_answer: Optional[str], standard_answer: Optional[str], options: Optional[list[str]]
) -> bool:
    option_list = [str(item).strip() for item in (options or []) if str(item).strip()]

    student_key = _resolve_choice_answer_key(student_answer, option_list)
    standard_key = _resolve_choice_answer_key(standard_answer, option_list)

    return bool(student_key and standard_key and student_key == standard_key)


def _extract_response_text(response: Any) -> str:
    if response is None:
        return ""

    if isinstance(response, JSONResponse):
        try:
            body = json.loads(response.body.decode("utf-8", "replace"))
            return _extract_response_text(body)
        except Exception:
            return ""

    if isinstance(response, dict):
        choices = response.get("choices", [])
        if choices:
            message = choices[0].get("message", {})
            content = message.get("content")
            if isinstance(content, str):
                return content.strip()
            if isinstance(content, list):
                text_parts = []
                for item in content:
                    if isinstance(item, dict) and isinstance(item.get("text"), str):
                        text_parts.append(item.get("text"))
                if text_parts:
                    return "\n".join(text_parts).strip()

        output = response.get("output")
        if isinstance(output, list):
            text_parts = []
            for item in output:
                if not isinstance(item, dict):
                    continue
                for content_item in item.get("content", []):
                    if isinstance(content_item, dict) and isinstance(
                        content_item.get("text"), str
                    ):
                        text_parts.append(content_item["text"])
            if text_parts:
                return "\n".join(text_parts).strip()

    return ""


def _extract_json_block(text: str) -> Any:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("Empty model response")

    try:
        return json.loads(raw)
    except Exception:
        pass

    decoder = json.JSONDecoder()
    for idx, ch in enumerate(raw):
        if ch not in "[{":
            continue
        try:
            obj, _ = decoder.raw_decode(raw[idx:])
            return obj
        except Exception:
            continue
    raise ValueError("Model output is not valid JSON")


def _split_text_chunks(text: str, chunk_size: int, overlap: int) -> list[str]:
    content = (text or "").strip()
    if not content:
        return []
    if chunk_size <= 0:
        return [content]

    chunks = []
    start = 0
    size = len(content)
    step = max(1, chunk_size - max(0, overlap))

    while start < size:
        end = min(size, start + chunk_size)
        chunk = content[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= size:
            break
        start += step

    return chunks


def _sample_evenly(items: list[str], max_count: int) -> list[str]:
    if max_count <= 0 or not items:
        return []
    if len(items) <= max_count:
        return items
    if max_count == 1:
        return [items[0]]

    indexes = sorted(
        {
            int(round(i * (len(items) - 1) / (max_count - 1)))
            for i in range(max_count)
        }
    )
    return [items[idx] for idx in indexes]


def _build_balanced_source_context(
    source_content: str, max_chars: int, segment_count: int
) -> str:
    content = (source_content or "").strip()
    if not content:
        return ""
    if max_chars <= 0 or len(content) <= max_chars:
        return content

    sampled_chunks = _sample_evenly(
        _split_text_chunks(
            content,
            chunk_size=max(1200, max_chars // max(1, segment_count)),
            overlap=0,
        ),
        max_count=max(1, segment_count),
    )

    if not sampled_chunks:
        return content[:max_chars]

    sections = []
    total = 0
    for idx, chunk in enumerate(sampled_chunks):
        section = f"[教材片段{idx + 1}]\n{chunk}\n"
        if total + len(section) > max_chars and sections:
            break
        sections.append(section)
        total += len(section)

    result = "\n".join(sections).strip()
    return result[:max_chars] if result else content[:max_chars]


def _resolve_base_model_id(request: Request, model_hint: Optional[str]) -> str:
    models = request.app.state.MODELS
    if model_hint and model_hint in models:
        return model_hint

    defaults = [
        item.strip()
        for item in str(request.app.state.config.DEFAULT_MODELS or "").split(",")
        if item.strip()
    ]
    for model_id in defaults:
        if model_id in models:
            return model_id

    if models:
        return next(iter(models))

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No available model",
    )


def _resolve_task_model_id(request: Request, base_model_id: str) -> str:
    return get_task_model_id(
        base_model_id,
        request.app.state.config.TASK_MODEL,
        request.app.state.config.TASK_MODEL_EXTERNAL,
        request.app.state.MODELS,
    )


async def _chat_json(
    request: Request,
    user: UserModel,
    model_id: str,
    system_prompt: str,
    user_prompt: str,
    task_name: str,
) -> Any:
    payload = {
        "model": model_id,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "metadata": {
            **(request.state.metadata if hasattr(request.state, "metadata") else {}),
            "task": task_name,
        },
    }

    payload = await process_pipeline_inlet_filter(
        request, payload, user, request.app.state.MODELS
    )
    response = await generate_chat_completion(request, payload, user)
    text = _extract_response_text(response)
    if not text:
        raise ValueError("Empty model output")
    return _extract_json_block(text)


async def _extract_knowledge_points_from_large_source(
    request: Request,
    user: UserModel,
    model_id: str,
    source_content: str,
) -> list[str]:
    knowledge_chunk_chars = int(os.getenv("HOMEWORK_KNOWLEDGE_CHUNK_CHARS", "12000"))
    knowledge_chunk_overlap = int(os.getenv("HOMEWORK_KNOWLEDGE_CHUNK_OVERLAP", "1200"))
    knowledge_max_chunks = int(os.getenv("HOMEWORK_KNOWLEDGE_MAX_CHUNKS", "6"))
    knowledge_max_points = int(os.getenv("HOMEWORK_KNOWLEDGE_MAX_POINTS", "40"))

    chunks = _split_text_chunks(source_content, knowledge_chunk_chars, knowledge_chunk_overlap)
    chunks = _sample_evenly(chunks, knowledge_max_chunks)

    if not chunks:
        return []

    system_prompt = (
        "你是教材知识点提取助手。"
        "请从教材片段提取核心知识点，返回JSON数组字符串。"
        "格式: [\"知识点1\", \"知识点2\"]。"
        "禁止输出JSON以外内容。"
    )

    merged: list[str] = []
    seen = set()

    for idx, chunk in enumerate(chunks):
        user_prompt = f"教材片段（第{idx + 1}/{len(chunks)}段）:\n{chunk}"
        try:
            data = await _chat_json(
                request,
                user,
                model_id,
                system_prompt,
                user_prompt,
                f"homework_knowledge_extraction_chunk_{idx + 1}",
            )
            points = data.get("knowledge_points", []) if isinstance(data, dict) else data
            if not isinstance(points, list):
                continue
            for item in points:
                point = str(item).strip()
                normalized = re.sub(r"\s+", " ", point)
                if not normalized:
                    continue
                key = normalized.lower()
                if key in seen:
                    continue
                seen.add(key)
                merged.append(normalized)
                if len(merged) >= knowledge_max_points:
                    return merged
        except Exception as e:
            log.warning(f"Knowledge extraction chunk {idx + 1} fallback: {e}")

    return merged[:knowledge_max_points]


def _normalize_questions(items: Any) -> list[dict]:
    if isinstance(items, dict):
        if isinstance(items.get("questions"), list):
            items = items.get("questions")
        else:
            items = [items]

    if not isinstance(items, list):
        raise ValueError("Questions output must be a JSON array")

    results = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue

        q_type = _normalize_type(str(item.get("type", "short_answer")))
        difficulty = _normalize_difficulty(str(item.get("difficulty", "medium")))
        question = str(item.get("question", "")).strip()
        if not question:
            continue

        options = item.get("options")
        if q_type in {"choice", "judge"}:
            if not isinstance(options, list):
                options = []
            options = [str(opt).strip() for opt in options if str(opt).strip()]
            if q_type == "judge" and not options:
                options = ["True", "False"]
        else:
            options = None

        answer = item.get("answer")
        if answer is not None:
            answer = str(answer).strip()

        analysis = item.get("analysis")
        if analysis is not None:
            analysis = str(analysis).strip()

        results.append(
            {
                "order_index": idx,
                "type": q_type,
                "difficulty": difficulty,
                "question": question,
                "options": options,
                "answer": answer,
                "analysis": analysis,
            }
        )

    if not results:
        raise ValueError("No valid questions generated")

    return results


def _can_access_homework(user: UserModel, homework_user_id: str) -> bool:
    return user.role == "admin" or user.id == homework_user_id


async def _grade_short_answer_with_ai(
    request: Request,
    user: UserModel,
    model_id: str,
    question: str,
    standard_answer: str,
    student_answer: str,
) -> dict:
    system_prompt = (
        "你是严格的作业批改助手。"
        "你必须返回JSON对象，包含字段: correct(boolean), score(0-100), feedback(string), analysis(string)。"
        "不要输出任何JSON之外的文字。"
    )
    user_prompt = (
        f"问题:\n{question}\n\n"
        f"标准答案:\n{standard_answer}\n\n"
        f"学生答案:\n{student_answer}\n\n"
        "请评分并给出反馈。"
    )
    try:
        data = await _chat_json(
            request,
            user,
            model_id,
            system_prompt,
            user_prompt,
            "homework_short_answer_grading",
        )
        if not isinstance(data, dict):
            raise ValueError("Invalid grading response")

        score = float(data.get("score", 0))
        score = max(0.0, min(100.0, score))
        return {
            "correct": bool(data.get("correct", score >= 60)),
            "score": score,
            "feedback": str(data.get("feedback", "")).strip(),
            "analysis": str(data.get("analysis", "")).strip(),
        }
    except Exception as e:
        log.warning(f"Short answer grading fallback: {e}")
        fallback_correct = (
            standard_answer.strip().lower() in student_answer.strip().lower()
            if standard_answer and student_answer
            else False
        )
        return {
            "correct": fallback_correct,
            "score": 100.0 if fallback_correct else 0.0,
            "feedback": "自动评分失败，已使用降级规则。",
            "analysis": "",
        }


def _validate_source_file(file) -> None:
    filename = (file.meta.get("name", file.filename) if file.meta else file.filename) or ""
    extension = os.path.splitext(filename.lower())[1]
    if extension not in SUPPORTED_FILE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF/Markdown/TXT files are supported",
        )


@router.get("/")
async def list_homeworks(
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    homeworks = Homeworks.get_homeworks_by_user_id(user.id, db=db)
    results = []
    for item in homeworks:
        questions = HomeworkQuestions.get_questions_by_homework_id(item.id, db=db)
        results.append(
            {
                "id": item.id,
                "title": item.title,
                "source_file": item.source_file,
                "source_file_id": item.source_file_id,
                "created_at": item.created_at,
                "question_count": len(questions),
                "difficulty_config": item.difficulty_config or {},
            }
        )
    return {"items": results}


@router.post("/generate")
async def generate_homework(
    request: Request,
    form_data: GenerateHomeworkForm,
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    if not request.app.state.MODELS:
        await get_all_models(request, user=user)

    source_file_name = "手动输入"
    source_content = (form_data.source_content or "").strip()

    if form_data.source_file_id:
        source_file = Files.get_file_by_id(form_data.source_file_id, db=db)
        if not source_file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source file not found",
            )

        if user.role != "admin" and source_file.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No access to source file",
            )

        _validate_source_file(source_file)
        source_file_name = (
            source_file.meta.get("name", source_file.filename)
            if source_file.meta
            else source_file.filename
        )
        if not source_content:
            source_content = (source_file.data or {}).get("content", "").strip()

    if not source_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source content is empty. Please upload and process a file first.",
        )

    source_max_chars = int(os.getenv("HOMEWORK_SOURCE_MAX_CHARS", "60000"))
    source_segment_count = int(os.getenv("HOMEWORK_SOURCE_SEGMENT_COUNT", "8"))
    generation_source_content = _build_balanced_source_context(
        source_content,
        source_max_chars,
        source_segment_count,
    )

    difficulty_config = {
        "easy": max(0, int(form_data.difficulty_config.easy)),
        "medium": max(0, int(form_data.difficulty_config.medium)),
        "hard": max(0, int(form_data.difficulty_config.hard)),
    }
    if sum(difficulty_config.values()) == 0:
        difficulty_config = DEFAULT_DIFFICULTY_CONFIG.copy()

    question_types = [
        _normalize_type(item) for item in (form_data.question_types or DEFAULT_QUESTION_TYPES)
    ]
    question_types = list(dict.fromkeys(question_types))
    if not question_types:
        question_types = DEFAULT_QUESTION_TYPES.copy()

    base_model_id = _resolve_base_model_id(request, form_data.model)
    task_model_id = _resolve_task_model_id(request, base_model_id)

    try:
        knowledge_points = await _extract_knowledge_points_from_large_source(
            request,
            user,
            task_model_id,
            source_content,
        )
    except Exception as e:
        log.warning(f"Knowledge extraction fallback: {e}")
        knowledge_points = []

    generation_system_prompt = (
        "你是作业生成助手。"
        "请严格输出JSON数组，每个元素字段为: "
        "type(choice|judge|short_answer), difficulty(easy|medium|hard), question, options(数组, choice/judge必填), answer, analysis。"
        "不要输出JSON以外的内容。"
    )
    generation_user_prompt = (
        "根据以下教材内容、知识点和用户要求生成作业题：\n\n"
        f"教材内容（全书均衡采样摘要）:\n{generation_source_content}\n\n"
        f"知识点:\n{json.dumps(knowledge_points, ensure_ascii=False)}\n\n"
        f"用户要求:\n{form_data.description or '无特殊要求'}\n\n"
        "难度分布:\n"
        f"easy: {difficulty_config['easy']}\n"
        f"medium: {difficulty_config['medium']}\n"
        f"hard: {difficulty_config['hard']}\n\n"
        f"题型要求:\n{json.dumps(question_types, ensure_ascii=False)}\n\n"
        "请确保题量与难度分布尽量匹配。"
    )

    try:
        generated_raw = await _chat_json(
            request,
            user,
            task_model_id,
            generation_system_prompt,
            generation_user_prompt,
            "homework_generation",
        )
        generated_questions = _normalize_questions(generated_raw)
    except Exception as e:
        log.exception(f"Failed to generate homework: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Homework generation failed",
        )

    title = (form_data.title or "").strip()
    if not title:
        title = f"作业 - {source_file_name}"

    source_context = {
        "chapter_title": (form_data.source_chapter_title or "").strip() or None,
        "chapter_start_page": form_data.source_chapter_start_page,
        "chapter_end_page": form_data.source_chapter_end_page,
    }
    source_context = {key: value for key, value in source_context.items() if value is not None}

    homework = Homeworks.insert_homework(
        user.id,
        HomeworkCreateForm(
            title=title,
            source_file=source_file_name,
            source_file_id=form_data.source_file_id,
            description=form_data.description,
            difficulty_config=difficulty_config,
            question_type_config={
                "types": question_types,
                **({"source_context": source_context} if source_context else {}),
            },
            knowledge_points=knowledge_points,
        ),
        db=db,
    )
    if not homework:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save homework",
        )

    questions = HomeworkQuestions.insert_questions(
        homework.id,
        [
            HomeworkQuestionCreateForm(
                order_index=item["order_index"],
                type=item["type"],
                difficulty=item["difficulty"],
                question=item["question"],
                options=item["options"],
                answer=item["answer"],
                analysis=item["analysis"],
            )
            for item in generated_questions
        ],
        db=db,
    )
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save generated questions",
        )

    return {
        "homework_id": homework.id,
        "homework": homework.model_dump(),
        "questions": [item.model_dump() for item in questions],
    }


@router.post("/create-from-questions")
async def create_homework_from_questions(
    form_data: CreateHomeworkFromQuestionsForm,
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    if not form_data.questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Questions are required",
        )

    source_file_name = (form_data.source_file or "").strip() or "章节作业"

    if form_data.source_file_id:
        source_file = Files.get_file_by_id(form_data.source_file_id, db=db)
        if not source_file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source file not found",
            )

        if user.role != "admin" and source_file.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No access to source file",
            )

        source_file_name = (
            source_file.meta.get("name", source_file.filename)
            if source_file.meta
            else source_file.filename
        )

    normalized_questions: list[dict[str, Any]] = []
    type_set: set[str] = set()

    for idx, item in enumerate(form_data.questions):
        question_text = (item.question or "").strip()
        if not question_text:
            continue

        q_type = _normalize_type(item.type)
        q_difficulty = _normalize_difficulty(item.difficulty)
        q_options = [str(opt).strip() for opt in (item.options or []) if str(opt).strip()]

        if q_type == "choice" and len(q_options) < 2:
            q_options = ["A", "B", "C", "D"]
        elif q_type == "judge" and not q_options:
            q_options = ["正确", "错误"]
        elif q_type == "short_answer":
            q_options = []

        normalized_questions.append(
            {
                "order_index": idx,
                "type": q_type,
                "difficulty": q_difficulty,
                "question": question_text,
                "options": q_options,
                "answer": (item.answer or "").strip(),
                "analysis": (item.analysis or "").strip(),
            }
        )
        type_set.add(q_type)

    if not normalized_questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid questions",
        )

    source_context = {
        "chapter_title": (form_data.source_chapter_title or "").strip() or None,
        "chapter_start_page": form_data.source_chapter_start_page,
        "chapter_end_page": form_data.source_chapter_end_page,
    }
    source_context = {key: value for key, value in source_context.items() if value is not None}

    title = (form_data.title or "").strip() or f"作业 - {source_file_name}"

    homework = Homeworks.insert_homework(
        user.id,
        HomeworkCreateForm(
            title=title,
            source_file=source_file_name,
            source_file_id=form_data.source_file_id,
            description=form_data.description,
            difficulty_config=DEFAULT_DIFFICULTY_CONFIG.copy(),
            question_type_config={
                "types": sorted(type_set),
                **({"source_context": source_context} if source_context else {}),
            },
            knowledge_points=[],
        ),
        db=db,
    )

    if not homework:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save homework",
        )

    questions = HomeworkQuestions.insert_questions(
        homework.id,
        [
            HomeworkQuestionCreateForm(
                order_index=item["order_index"],
                type=item["type"],
                difficulty=item["difficulty"],
                question=item["question"],
                options=item["options"],
                answer=item["answer"],
                analysis=item["analysis"],
            )
            for item in normalized_questions
        ],
        db=db,
    )

    if not questions:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save generated questions",
        )

    return {
        "homework_id": homework.id,
        "homework": homework.model_dump(),
        "questions": [item.model_dump() for item in questions],
    }


@router.post("/submit")
async def submit_homework(
    request: Request,
    form_data: SubmitHomeworkForm,
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    homework = Homeworks.get_homework_by_id(form_data.homework_id, db=db)
    if not homework:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Homework not found",
        )

    if not _can_access_homework(user, homework.user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    questions = HomeworkQuestions.get_questions_by_homework_id(homework.id, db=db)
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No questions in homework",
        )

    if not request.app.state.MODELS:
        await get_all_models(request, user=user)

    base_model_id = _resolve_base_model_id(request, form_data.model)
    task_model_id = _resolve_task_model_id(request, base_model_id)

    answer_map = {item.question_id: (item.answer or "").strip() for item in form_data.answers}
    results = []
    submission_answers = []

    question_weight = 100.0 / len(questions)
    total_score = 0.0
    correct_count = 0

    for question in questions:
        student_answer = answer_map.get(question.id, "")
        standard_answer = (question.answer or "").strip()
        is_correct = False
        score = 0.0
        feedback = ""
        analysis = question.analysis or ""

        if question.type == "choice":
            is_correct = _is_choice_answer_correct(
                student_answer,
                standard_answer,
                question.options,
            )
            score = question_weight if is_correct else 0.0
            feedback = "正确" if is_correct else "错误"

        elif question.type == "judge":
            is_correct = _normalize_judge_value(student_answer) == _normalize_judge_value(
                standard_answer
            )
            score = question_weight if is_correct else 0.0
            feedback = "正确" if is_correct else "错误"

        else:
            if not student_answer:
                is_correct = False
                score = 0.0
                feedback = "未作答"
                analysis = question.analysis or standard_answer
                grading = None
            else:
                grading = await _grade_short_answer_with_ai(
                    request,
                    user,
                    task_model_id,
                    question.question,
                    standard_answer,
                    student_answer,
                )
            if grading is None:
                pass
            else:
                is_correct = bool(grading["correct"])
                score = question_weight * (float(grading["score"]) / 100.0)
                feedback = grading.get("feedback", "")
                if grading.get("analysis"):
                    analysis = grading.get("analysis")

        if is_correct:
            correct_count += 1
        total_score += score

        result_item = {
            "question_id": question.id,
            "type": question.type,
            "difficulty": question.difficulty,
            "question": question.question,
            "student_answer": student_answer,
            "standard_answer": standard_answer,
            "is_correct": is_correct,
            "score": round(score, 2),
            "feedback": feedback,
            "analysis": analysis,
        }
        results.append(result_item)
        submission_answers.append(
            HomeworkSubmissionAnswerCreateForm(
                question_id=question.id,
                answer=student_answer,
                is_correct=is_correct,
                score=round(score, 2),
                feedback=feedback,
                analysis=analysis,
            )
        )

    total_score = round(total_score, 2)
    submission = HomeworkSubmissions.insert_submission(
        homework.id,
        user.id,
        HomeworkSubmissionCreateForm(
            score=total_score,
            total_questions=len(questions),
            correct_count=correct_count,
        ),
        db=db,
    )
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save submission",
        )

    HomeworkSubmissionAnswers.insert_submission_answers(
        submission.id,
        submission_answers,
        db=db,
    )

    try:
        source_context = (
            homework.question_type_config.get("source_context", {})
            if isinstance(homework.question_type_config, dict)
            else {}
        )
        if homework.source_file_id and source_context:
            update_chapter_mindmap_from_homework_results(
                file_id=homework.source_file_id,
                chapter_title=source_context.get("chapter_title"),
                chapter_start_page=source_context.get("chapter_start_page"),
                chapter_end_page=source_context.get("chapter_end_page"),
                results=results,
                knowledge_points=homework.knowledge_points,
                db=db,
            )
    except Exception as e:
        log.warning("Homework mindmap update failed for %s: %s", homework.id, e)

    return {
        "submission_id": submission.id,
        "homework_id": homework.id,
        "score": total_score,
        "correct_count": correct_count,
        "total_questions": len(questions),
        "results": results,
    }


@router.get("/{homework_id}")
async def get_homework(
    homework_id: str,
    user=Depends(get_verified_user),
    db: Session = Depends(get_session),
):
    homework = Homeworks.get_homework_by_id(homework_id, db=db)
    if not homework:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Homework not found",
        )

    if not _can_access_homework(user, homework.user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    questions = HomeworkQuestions.get_questions_by_homework_id(homework_id, db=db)
    submissions = HomeworkSubmissions.get_submissions_by_homework_id(homework_id, db=db)

    latest_submission = submissions[0] if submissions else None
    latest_submission_results: list[dict[str, Any]] = []

    if latest_submission:
        submission_answers = HomeworkSubmissionAnswers.get_submission_answers_by_submission_id(
            latest_submission.id, db=db
        )
        answer_map = {item.question_id: item for item in submission_answers}

        for question in questions:
            graded = answer_map.get(question.id)
            latest_submission_results.append(
                {
                    "question_id": question.id,
                    "type": question.type,
                    "difficulty": question.difficulty,
                    "question": question.question,
                    "student_answer": (graded.answer if graded else "") or "",
                    "standard_answer": (question.answer or "").strip(),
                    "is_correct": bool(graded.is_correct) if graded else False,
                    "score": round(float(graded.score), 2) if graded else 0.0,
                    "feedback": (graded.feedback if graded else "") or "",
                    "analysis": (graded.analysis if graded else (question.analysis or "")) or "",
                }
            )

    return {
        "homework": homework.model_dump(),
        "questions": [q.model_dump() for q in questions],
        "submissions": [s.model_dump() for s in submissions[:5]],
        "latest_submission": latest_submission.model_dump() if latest_submission else None,
        "latest_submission_results": latest_submission_results,
    }
