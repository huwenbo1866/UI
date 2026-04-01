import json
import logging
import re
from typing import Any, Optional

from open_webui.models.users import UserModel

log = logging.getLogger(__name__)


def _extract_response_text(response: Any) -> str:
    if response is None:
        return ""

    if hasattr(response, "body"):
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


def _sample_text(content: str, max_chars: int = 18000, segments: int = 6) -> str:
    text = (content or "").strip()
    if len(text) <= max_chars:
        return text

    if segments <= 1:
        return text[:max_chars]

    chunk_len = max(1200, max_chars // segments)
    size = len(text)
    indexes = sorted({int(round(i * (size - chunk_len) / (segments - 1))) for i in range(segments)})

    out = []
    for idx, start in enumerate(indexes):
        end = min(size, start + chunk_len)
        out.append(f"[片段{idx + 1}]\n{text[start:end].strip()}")

    merged = "\n\n".join(out)
    return merged[:max_chars]


def _normalize_subject(subject: Optional[str]) -> str:
    key = (subject or "").strip().lower()
    mapping = {
        "chinese": "chinese",
        "语文": "chinese",
        "math": "math",
        "数学": "math",
        "english": "english",
        "英语": "english",
        "other": "other",
        "general": "other",
    }
    return mapping.get(key, "other")


def _subject_instruction(subject: str, count: int) -> str:
    total = max(1, int(count or 1))
    if subject == "chinese":
        return f"生成{total}道古诗词或课本原文高区分度填空题，优先考查易错字词、上下句联动与语境辨析，答案必须可核对。"

    return (
        "按综合性考试难度固定生成20道题：10道选择题+10道判断题。"
        "选择题必须4个完整具体选项且答案为A/B/C/D，禁止只给A/B/C/D占位。"
        "判断题请直接给出判断陈述句，不要写“请判断下列结论是否成立”前缀。"
    )


def _exam_difficulty_at(index: int, total_count: int) -> str:
    total = max(1, int(total_count or 1))
    hard_target = max(1, int(round(total * 0.6)))
    medium_target = max(0, total - hard_target)

    if index < hard_target:
        return "hard"
    if index < hard_target + medium_target:
        return "medium"
    return "medium"


def _coerce_exam_difficulty(value: Any, index: int, total_count: int) -> str:
    key = str(value or "").strip().lower()
    mapping = {
        "hard": "hard",
        "difficult": "hard",
        "困难": "hard",
        "medium": "medium",
        "normal": "medium",
        "中等": "medium",
        "easy": "easy",
        "simple": "easy",
        "简单": "easy",
    }
    normalized = mapping.get(key)
    if normalized == "easy":
        # 强化题默认至少中等难度，避免退化为基础题。
        return "medium"
    if normalized in {"medium", "hard"}:
        return normalized
    return _exam_difficulty_at(index, total_count)


def _parse_options(raw_options: Any) -> list[str]:
    if isinstance(raw_options, list):
        options = [str(o).strip() for o in raw_options if str(o).strip()]
        return options

    if isinstance(raw_options, str):
        text = raw_options.strip()
        if not text:
            return []
        # Support options packed in one string, e.g. "A.xxx B.xxx C.xxx D.xxx" or line-separated.
        chunks = re.split(r"\n+|(?=[A-D][\.|、\)|:：])", text)
        options = []
        for chunk in chunks:
            cleaned = chunk.strip()
            if not cleaned:
                continue
            cleaned = re.sub(r"^[A-D][\.|、\)|:：]\s*", "", cleaned)
            if cleaned:
                options.append(cleaned)
        return options

    return []


def _ensure_choice_options(options: list[str], question: str) -> list[str]:
    cleaned: list[str] = []
    for opt in options:
        text = re.sub(r"^[A-Da-d][\.|、\)|:：]\s*", "", str(opt or "").strip())
        if not text:
            continue
        if text.upper() in {"A", "B", "C", "D"}:
            continue
        cleaned.append(text)

    if len(cleaned) >= 4:
        return cleaned[:4]

    fallback_pool = [
        "只满足了局部条件，忽略了关键限制",
        "看似合理但与定义边界冲突",
        "计算过程正确但结论对象不匹配",
        "混淆了必要条件与充分条件",
    ]

    if question:
        fallback_pool = [
            f"由题干可得：{fallback_pool[0]}",
            f"根据题意可判定：{fallback_pool[1]}",
            f"结合条件分析：{fallback_pool[2]}",
            f"对比选项可见：{fallback_pool[3]}",
        ]

    i = 0
    while len(cleaned) < 4:
        cleaned.append(fallback_pool[i % len(fallback_pool)])
        i += 1

    return cleaned[:4]


def _is_image_dependent_text(*parts: Any) -> bool:
    text = " ".join(str(part or "") for part in parts).lower()
    image_markers = [
        "如图",
        "下图",
        "上图",
        "看图",
        "图中",
        "图1",
        "图2",
        "图片",
        "图像",
        "示意图",
        "配图",
        "图示",
    ]
    return any(marker in text for marker in image_markers)


def _normalize_question_stem(question: str, min_length: int = 14) -> str:
    stem = re.sub(r"\s+", " ", str(question or "").strip())
    if not stem:
        return ""
    if len(stem) >= min_length:
        return stem
    # 轻量补全，避免强行拉长题干影响速度与自然度。
    return f"{stem}（请结合章节知识点作答）"


def _normalize_for_subject_mix(result: list[dict], subject: str, total_count: int) -> list[dict]:
    normalized = result[:total_count]

    if subject == "chinese":
        for i, item in enumerate(normalized):
            item["order_index"] = i
            item["type"] = "fill_blank"
            item["options"] = None
        return normalized

    # non-Chinese subjects: enforce 10 choice + 10 judge for 20-question sets.
    if total_count >= 20:
        target_choice = 10
    else:
        target_choice = max(1, int(round(total_count * 0.6)))
        if total_count >= 2:
            target_choice = min(target_choice, total_count - 1)
        else:
            target_choice = min(target_choice, total_count)
    for i, item in enumerate(normalized):
        item["order_index"] = i
        if i < target_choice:
            item["type"] = "choice"
            item["options"] = _ensure_choice_options(
                _parse_options(item.get("options")), str(item.get("question", ""))
            )
            ans = str(item.get("answer", "")).upper()
            m = re.search(r"[ABCD]", ans)
            item["answer"] = m.group(0) if m else "A"
        else:
            item["type"] = "judge"
            item["options"] = ["正确", "错误"]
            a = str(item.get("answer", "")).strip()
            if a in {"对", "正确", "true", "True", "TRUE", "是"}:
                item["answer"] = "正确"
            elif a in {"错", "错误", "false", "False", "FALSE", "否"}:
                item["answer"] = "错误"
            else:
                item["answer"] = "正确"

    return normalized


def _fallback_question_by_context(chapter_title: str, q_type: str, index: int) -> tuple[str, list[str] | None, str, str]:
    chapter_name = (chapter_title or "本章节").strip() or "本章节"

    if q_type == "judge":
        question = (
            f"在{chapter_name}中，改变参照条件会影响对同一现象的判断结论。"
        )
        return question, ["正确", "错误"], "正确", "先定位条件，再核对定义适用范围，避免被表面结论误导。"

    question = (
        f"基于{chapter_name}的关键知识，请从不同解题角度比较四个结论，"
        f"选择唯一满足全部条件的选项（第{index + 1}题）。"
    )
    return question, ["A", "B", "C", "D"], "A", "优先检查隐含限制条件，再排除“看似合理但违背定义”的干扰项。"


async def _chat_json(
    request: Any,
    user: UserModel,
    model_id: str,
    system_prompt: str,
    user_prompt: str,
    task_name: str,
) -> Any:
    # Delay heavy imports to avoid module import cycles during app bootstrap.
    from open_webui.routers.pipelines import process_pipeline_inlet_filter
    from open_webui.utils.chat import generate_chat_completion

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


def _resolve_model_id(request: Any) -> str:
    models = request.app.state.MODELS
    if not models:
        raise ValueError("No available model")

    defaults = [
        item.strip()
        for item in str(request.app.state.config.DEFAULT_MODELS or "").split(",")
        if item.strip()
    ]
    for model_id in defaults:
        if model_id in models:
            return model_id

    return next(iter(models))


def _normalize_chapter_questions(
    data: Any,
    subject: str,
    total_count: int,
    chapter_title: str = "",
    allow_placeholder_fallback: bool = True,
) -> list[dict]:
    if isinstance(data, dict):
        if isinstance(data.get("questions"), list):
            data = data["questions"]
        else:
            data = [data]

    if not isinstance(data, list):
        raise ValueError("Invalid question format")

    result = []
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            continue

        q = str(item.get("question", "")).strip()
        a = str(item.get("answer", "")).strip()
        if not q or not a:
            continue

        if _is_image_dependent_text(q, item.get("analysis", ""), item.get("options", "")):
            continue

        q = _normalize_question_stem(q)
        if not q:
            continue

        q_type = str(item.get("type", "fill_blank")).strip().lower()
        if q_type in {"true_false", "truefalse", "判断", "判断题"}:
            q_type = "judge"

        # Infer choice when answer/options clearly indicate objective option style.
        raw_answer = str(item.get("answer", "")).upper()
        if q_type not in {"choice", "judge"}:
            if re.search(r"[ABCD]", raw_answer):
                q_type = "choice"
            elif isinstance(item.get("options"), (list, str)) and str(item.get("options", "")).strip():
                q_type = "choice"

        if subject == "chinese":
            q_type = "fill_blank"
        elif q_type not in {"choice", "judge"}:
            q_type = "choice"

        options = _parse_options(item.get("options"))
        if q_type == "choice":
            options = _ensure_choice_options(options, q)
            answer = str(a).upper()
            answer_match = re.search(r"[ABCD]", answer)
            if not answer_match:
                answer = "A"
            else:
                answer = answer_match.group(0)
        elif q_type == "judge":
            options = ["正确", "错误"]
            if a in {"对", "正确", "true", "True", "TRUE", "是"}:
                answer = "正确"
            elif a in {"错", "错误", "false", "False", "FALSE", "否"}:
                answer = "错误"
            else:
                answer = a if a in {"正确", "错误"} else "正确"
        else:
            options = None
            answer = a

        result.append(
            {
                "order_index": idx,
                "type": q_type,
                "difficulty": _exam_difficulty_at(idx, total_count),
                "question": q,
                "options": options,
                "answer": answer,
                "analysis": str(item.get("analysis", "")).strip(),
            }
        )

        if len(result) >= total_count:
            break

    if len(result) < total_count and allow_placeholder_fallback:
        for i in range(len(result), total_count):
            if subject == "chinese":
                fallback_type = "fill_blank"
            else:
                target_choice = max(1, int(round(total_count * 0.6)))
                if total_count >= 2:
                    target_choice = min(target_choice, total_count - 1)
                fallback_type = "choice" if i < target_choice else "judge"

            fallback_question, fallback_options, fallback_answer, fallback_analysis = _fallback_question_by_context(
                chapter_title, fallback_type, i
            )
            result.append(
                {
                    "order_index": i,
                    "type": fallback_type,
                    "difficulty": _exam_difficulty_at(i, total_count),
                    "question": fallback_question,
                    "options": fallback_options,
                    "answer": fallback_answer if fallback_type in {"choice", "judge"} else "见教材原文",
                    "analysis": fallback_analysis,
                }
            )

    return _normalize_for_subject_mix(result, subject, total_count)


def build_answer_markdown(questions: list[dict]) -> str:
    lines = ["# 参考答案", ""]
    for idx, item in enumerate(questions, start=1):
        lines.append(f"## 第{idx}题")
        lines.append(f"- 题目：{item.get('question', '')}")
        lines.append(f"- 答案：{item.get('answer', '')}")
        analysis = item.get("analysis", "")
        if analysis:
            lines.append(f"- 解析：{analysis}")
        lines.append("")
    return "\n".join(lines).strip()


async def generate_chapter_homework_questions(
    request: Any,
    user: UserModel,
    chapter_title: str,
    chapter_content: str,
    subject: Optional[str],
    count: int = 20,
) -> list[dict]:
    from open_webui.utils.task import get_task_model_id

    normalized_subject = _normalize_subject(subject)
    if normalized_subject != "chinese":
        count = 20
    base_model_id = _resolve_model_id(request)
    task_model_id = get_task_model_id(
        base_model_id,
        request.app.state.config.TASK_MODEL,
        request.app.state.config.TASK_MODEL_EXTERNAL,
        request.app.state.MODELS,
    )

    system_prompt = (
        "你是中小学作业命题助手。"
        "必须只输出JSON数组，每个元素字段为："
        "type,question,options,answer,analysis。"
        "题目需对齐同学段考试难度，强调知识迁移、综合理解与迷惑项设计，避免只考死记硬背。"
        "严禁生成任何依赖图片、图像、示意图、看图作答的题目。"
        "题干应清晰可判分，不必刻意写成长段；可直接围绕章节知识点命题。"
        "同一知识点尽量从不同角度设问，并设置合理干扰陷阱。"
        "非语文时，必须固定10道选择题+10道判断题。"
        "选择题四个选项必须完整具体，禁止A/B/C/D占位。"
        "判断题题干必须是直接陈述句，不要使用“请判断下列结论是否成立”模板。"
        "答案必须可直接判定。"
        "严禁输出JSON之外内容。"
    )

    user_prompt = (
        f"学科：{normalized_subject}\n"
        f"章节标题：{chapter_title}\n"
        f"要求：{_subject_instruction(normalized_subject, count)}\n"
        f"题目数量：{count}。\n"
        "难度要求：整体以中高难为主，区分度要明显。\n"
        "禁止图像题：不要出现“如图/下图/图中/看图”或任何需要配图才能作答的描述。\n"
        "题干要求：表达清楚即可，不强制长题干；可以直接基于章节知识点命题。\n"
        "命题角度：同知识点可从概念辨析、条件变化、易错陷阱等角度出题。\n"
        "题型硬约束（非语文）：选择题固定10道，判断题固定10道。\n"
        "选择题约束：四个选项必须是完整文本，不允许A/B/C/D空白占位。\n"
        "判断题约束：直接输出判断陈述句题目，不写“请判断……”前缀。\n"
        "若是选择题，options必须4个且answer为A/B/C/D。\n\n"
        f"章节内容：\n{_sample_text(chapter_content)}"
    )

    raw = await _chat_json(
        request,
        user,
        task_model_id,
        system_prompt,
        user_prompt,
        "knowledge_chapter_homework_generation",
    )

    normalized = _normalize_chapter_questions(
        raw,
        normalized_subject,
        count,
        chapter_title=chapter_title,
        allow_placeholder_fallback=False,
    )

    # 为了保证输出速度，数量不足时直接走高质量模板兜底，不再进行二次补生成。
    if len(normalized) < count:
        normalized = _normalize_chapter_questions(
            normalized,
            normalized_subject,
            count,
            chapter_title=chapter_title,
            allow_placeholder_fallback=True,
        )

    return _normalize_for_subject_mix(normalized, normalized_subject, count)

def _normalize_reinforcement_questions(data: Any, count: int) -> list[dict]:
    if isinstance(data, dict):
        if isinstance(data.get("questions"), list):
            data = data.get("questions")
        else:
            data = [data]

    if not isinstance(data, list):
        raise ValueError("Invalid reinforcement format")

    result: list[dict] = []
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            continue

        question = str(item.get("question", "")).strip()
        answer = str(item.get("answer", "")).strip()
        if not question or not answer:
            continue

        if _is_image_dependent_text(question, item.get("analysis", ""), item.get("options", "")):
            continue

        question = _normalize_question_stem(question)
        if not question:
            continue

        q_type = str(item.get("type", "choice")).strip().lower()
        if q_type in {"judge", "true_false", "truefalse", "判断", "判断题"}:
            options = ["正确", "错误"]
            if answer in {"对", "正确", "true", "True", "TRUE", "是"}:
                answer = "正确"
            elif answer in {"错", "错误", "false", "False", "FALSE", "否"}:
                answer = "错误"
            elif answer not in {"正确", "错误"}:
                answer = "正确"
            q_type = "judge"
        else:
            options = _parse_options(item.get("options"))
            if len(options) < 4:
                options = [opt for opt in options if opt][:4]
                while len(options) < 4:
                    options.append(f"选项{len(options) + 1}")
            q_type = "choice"

        result.append(
            {
                "order_index": idx,
                "type": q_type,
                "difficulty": _coerce_exam_difficulty(
                    item.get("difficulty", "medium"), idx, count
                ),
                "question": question,
                "options": options,
                "answer": answer,
                "analysis": str(item.get("analysis", "")).strip(),
            }
        )

        if len(result) >= count:
            break

    return result


async def generate_reinforcement_questions_from_records(
    request: Any,
    user: UserModel,
    chapter_title: str,
    wrong_records: list[dict],
    existing_questions: list[str],
    subject: Optional[str],
    count: int,
) -> list[dict]:
    from open_webui.utils.task import get_task_model_id

    if count <= 0:
        return []

    normalized_subject = _normalize_subject(subject)
    base_model_id = _resolve_model_id(request)
    task_model_id = get_task_model_id(
        base_model_id,
        request.app.state.config.TASK_MODEL,
        request.app.state.config.TASK_MODEL_EXTERNAL,
        request.app.state.MODELS,
    )

    wrong_text = json.dumps(wrong_records[:20], ensure_ascii=False)
    existing_text = json.dumps(existing_questions[:120], ensure_ascii=False)

    system_prompt = (
        "你是中小学命题教研助手。"
        "必须只输出JSON数组，每项字段：type,question,options,answer,analysis,difficulty。"
        "新题必须与错题同一知识类型，又具有差异性，绝不允许是题干/选项的简单改变。"
        "必须围绕错题同一知识类型生成可判分题。"
        "新题难度至少为中等，优先中高难，符合考试命题风格。"
        "严禁生成图像题或看图题，题干必须在无配图条件下独立可解。"
    )

    user_prompt = (
        f"章节：{chapter_title}\n"
        f"学科：{normalized_subject}\n"
        f"目标：生成{count}道全新强化题。\n"
        "约束：\n"
        "1) 与existing_questions中的题干重复度要低（避免同题复读）；\n"
        "2) 聚焦wrong_records中的易错知识类型；\n"
        "3) 选择题必须4个可区分选项，answer可写正确选项文本或A/B/C/D；\n"
        "4) 判断题answer只能为正确/错误；\n"
        "5) 禁止“如图/下图/图中/看图”等图像依赖表述，题干要长且清晰。\n\n"
        f"wrong_records={wrong_text}\n"
        f"existing_questions={existing_text}"
    )

    raw = await _chat_json(
        request,
        user,
        task_model_id,
        system_prompt,
        user_prompt,
        "knowledge_chapter_homework_reinforcement_generation",
    )

    return _normalize_reinforcement_questions(raw, count)