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


def _subject_instruction(subject: str) -> str:
    if subject == "chinese":
        return "仅生成古诗词或课本原文填空题，5道，答案必须是可核对的准确字词或句子。"
    return "生成20道题：10道选择题+10道判断题。选择题必须4个选项且答案为A/B/C/D；判断题答案只能是正确或错误。"


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


def _normalize_for_subject_mix(result: list[dict], subject: str, total_count: int) -> list[dict]:
    normalized = result[:total_count]

    if subject == "chinese":
        for i, item in enumerate(normalized):
            item["order_index"] = i
            item["type"] = "fill_blank"
            item["options"] = None
        return normalized

    # all non-Chinese subjects: exactly 10 choice + 10 judge (20 total)
    target_choice = min(10, total_count)
    for i, item in enumerate(normalized):
        item["order_index"] = i
        if i < target_choice:
            item["type"] = "choice"
            item["options"] = _parse_options(item.get("options"))
            if len(item["options"]) < 4:
                item["options"] = ["A", "B", "C", "D"]
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


def _normalize_chapter_questions(data: Any, subject: str, total_count: int) -> list[dict]:
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
            if len(options) < 4:
                options = [
                    options[0] if len(options) > 0 else "A",
                    options[1] if len(options) > 1 else "B",
                    options[2] if len(options) > 2 else "C",
                    options[3] if len(options) > 3 else "D",
                ]
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
                "difficulty": "easy",
                "question": q,
                "options": options,
                "answer": answer,
                "analysis": str(item.get("analysis", "")).strip(),
            }
        )

        if len(result) >= total_count:
            break

    if len(result) < total_count:
        for i in range(len(result), total_count):
            if subject == "chinese":
                fallback_type = "fill_blank"
            else:
                fallback_type = "choice" if i < 10 else "judge"
            result.append(
                {
                    "order_index": i,
                    "type": fallback_type,
                    "difficulty": "easy",
                    "question": f"请根据本章内容回答第{i + 1}题。",
                    "options": ["A", "B", "C", "D"] if fallback_type == "choice" else (["正确", "错误"] if fallback_type == "judge" else None),
                    "answer": "A" if fallback_type == "choice" else ("正确" if fallback_type == "judge" else "见教材原文"),
                    "analysis": "请结合章节重点复习。",
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
        "题目要简单，答案必须可直接判定。"
        "严禁输出JSON之外内容。"
    )

    user_prompt = (
        f"学科：{normalized_subject}\n"
        f"章节标题：{chapter_title}\n"
        f"要求：{_subject_instruction(normalized_subject)}\n"
        f"题目数量：{count}。\n"
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

    return _normalize_chapter_questions(raw, normalized_subject, count)
