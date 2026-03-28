import html
import logging
import re
from typing import Any, Optional

from sqlalchemy.orm import Session

from open_webui.models.files import (
    FileChapterMindmapCreateForm,
    FileChapterMindmapUpdateForm,
    FileChapterMindmaps,
)
from open_webui.models.users import UserModel
from open_webui.services.homework_generation import (
    _chat_json,
    _normalize_subject,
    _resolve_model_id,
    _sample_text,
)

log = logging.getLogger(__name__)

DEFAULT_MASTERY_SCORE = 50.0
MAX_DEPTH = 3
MAX_CHILDREN = 6


def _clean_label(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[`#*_>\-]{2,}", " ", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.strip(" -:：,，。；;|")
    if not text:
        text = fallback
    return text[:32]


def _unique_strings(values: list[Any], limit: int = 6) -> list[str]:
    seen = set()
    result: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if not text:
            continue
        normalized = re.sub(r"\s+", "", text.lower())
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(text[:24])
        if len(result) >= limit:
            break
    return result


def _default_children_from_title(chapter_title: str) -> list[dict]:
    topic = re.sub(r"^第[一二三四五六七八九十0-9]+[章节单元课]\s*", "", chapter_title).strip()
    topic = topic or chapter_title
    return [
        {
            "label": "核心概念",
            "aliases": [topic, "概念", "定义"],
            "children": [
                {"label": "基础定义", "aliases": [topic, "定义"]},
                {"label": "关键特征", "aliases": [topic, "特点"]},
            ],
        },
        {
            "label": "重点规律",
            "aliases": [topic, "规律", "原理"],
            "children": [
                {"label": "核心规律", "aliases": [topic, "规律"]},
                {"label": "典型应用", "aliases": [topic, "应用"]},
            ],
        },
        {
            "label": "易错薄弱",
            "aliases": [topic, "易错点", "错题"],
            "children": [
                {"label": "常见误区", "aliases": [topic, "误区"]},
                {"label": "纠错方法", "aliases": [topic, "纠错"]},
            ],
        },
    ]


def _normalize_tree_node(node: Any, fallback_label: str, depth: int, path: str) -> dict:
    raw = node if isinstance(node, dict) else {}
    label = _clean_label(
        raw.get("label") or raw.get("title") or raw.get("name"),
        fallback_label,
    )
    aliases = _unique_strings(
        [label, *(raw.get("aliases") or []), *(raw.get("keywords") or [])]
    )

    normalized = {
        "id": path,
        "label": label,
        "aliases": aliases,
        "mastery_score": float(raw.get("mastery_score") or DEFAULT_MASTERY_SCORE),
        "practice_count": int(raw.get("practice_count") or 0),
        "correct_count": int(raw.get("correct_count") or 0),
        "wrong_count": int(raw.get("wrong_count") or 0),
        "children": [],
    }

    if depth >= MAX_DEPTH:
        return normalized

    children = raw.get("children")
    if not isinstance(children, list):
        children = []

    for index, child in enumerate(children[:MAX_CHILDREN], start=1):
        normalized["children"].append(
            _normalize_tree_node(child, f"{label}-{index}", depth + 1, f"{path}.{index}")
        )

    return normalized


def _normalize_tree_data(raw: Any, chapter_title: str) -> dict:
    if isinstance(raw, dict):
        if isinstance(raw.get("mindmap"), dict):
            raw = raw["mindmap"]
        elif isinstance(raw.get("root"), dict):
            raw = raw["root"]

    if not isinstance(raw, dict):
        raw = {"label": chapter_title, "children": []}

    root = _normalize_tree_node(raw, chapter_title, 1, "root")
    root["label"] = _clean_label(chapter_title, chapter_title)

    if not root["children"]:
        fallback_children = _default_children_from_title(chapter_title)
        root["children"] = [
            _normalize_tree_node(item, item.get("label", "知识点"), 2, f"root.{index}")
            for index, item in enumerate(fallback_children, start=1)
        ]

    return root


def _aggregate_node_state(node: dict) -> dict:
    children = node.get("children") or []
    if not children:
        return node

    aggregated_children = [_aggregate_node_state(child) for child in children]
    avg_score = sum(float(child.get("mastery_score") or DEFAULT_MASTERY_SCORE) for child in aggregated_children) / max(
        1, len(aggregated_children)
    )
    if int(node.get("practice_count") or 0) <= 0:
        node["mastery_score"] = round(avg_score, 2)
    node["wrong_count"] = max(
        int(node.get("wrong_count") or 0),
        max(int(child.get("wrong_count") or 0) for child in aggregated_children),
    )
    return node


def _node_visual(node: dict) -> tuple[str, str]:
    score = float(node.get("mastery_score") or DEFAULT_MASTERY_SCORE)
    wrong_count = int(node.get("wrong_count") or 0)

    if score >= 85 and wrong_count <= 1:
        return "mastered", "#60a5fa"

    risk = max(0.0, (70 - score) * 0.9 + wrong_count * 12)
    if risk >= 65:
        return "high_risk", "#b91c1c"
    if risk >= 45:
        return "high_risk", "#dc2626"
    if risk >= 25:
        return "weak", "#f87171"
    return "unmastered", "#f472b6"


def _render_markdown_lines(node: dict, depth: int, lines: list[str]) -> None:
    _, color = _node_visual(node)
    label = html.escape(str(node.get("label") or "未命名节点"))
    prefix = "#" * max(1, depth)
    lines.append(
        f'{prefix} <span style="color:{color};font-weight:700;">{label}</span>'
    )

    for child in node.get("children") or []:
        _render_markdown_lines(child, depth + 1, lines)


def build_markmap_markdown(tree_data: dict) -> str:
    normalized = _aggregate_node_state(tree_data)
    lines: list[str] = []
    _render_markdown_lines(normalized, 1, lines)
    return "\n".join(lines).strip()


def _normalize_text(value: Any) -> str:
    text = str(value or "").lower()
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[^\u4e00-\u9fa5a-z0-9]", "", text)
    return text


def _node_terms(node: dict) -> list[str]:
    values = [node.get("label"), *(node.get("aliases") or [])]
    return [term for term in (_normalize_text(value) for value in values) if len(term) >= 2]


def _flatten_nodes(node: dict) -> list[dict]:
    items = [node]
    for child in node.get("children") or []:
        items.extend(_flatten_nodes(child))
    return items


def _score_node(node: dict, text: str) -> int:
    best = 0
    for term in _node_terms(node):
        if term in text:
            best = max(best, len(term) * 10)
        elif len(term) >= 4:
            for size in range(min(4, len(term)), 1, -1):
                for index in range(0, len(term) - size + 1):
                    chunk = term[index : index + size]
                    if chunk in text:
                        best = max(best, size * 3)
    return best


def _find_matching_nodes(tree_data: dict, text: str, limit: int = 3) -> list[dict]:
    normalized_text = _normalize_text(text)
    if not normalized_text:
        return [tree_data]

    scored = []
    for node in _flatten_nodes(tree_data):
        if node.get("id") == "root":
            continue
        score = _score_node(node, normalized_text)
        if score > 0:
            scored.append((score, node))

    if not scored:
        return [tree_data]

    scored.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored[:limit]]


def _apply_mastery_delta(node: dict, is_correct: bool, weight: float = 1.0) -> None:
    count_delta = max(1, int(round(weight)))
    node["practice_count"] = int(node.get("practice_count") or 0) + count_delta

    current_score = float(node.get("mastery_score") or DEFAULT_MASTERY_SCORE)
    if is_correct:
        node["correct_count"] = int(node.get("correct_count") or 0) + count_delta
        node["mastery_score"] = min(100.0, current_score + 12.0 * weight)
    else:
        node["wrong_count"] = int(node.get("wrong_count") or 0) + count_delta
        penalty = 18.0 * weight + min(12.0, int(node["wrong_count"]) * 2.5)
        node["mastery_score"] = max(0.0, current_score - penalty)


async def generate_chapter_mindmap(
    request: Any,
    user: UserModel,
    chapter_title: str,
    chapter_content: str,
    subject: Optional[str],
) -> dict:
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
        "你是中小学教材思维导图生成助手。"
        "请只输出JSON对象，字段为 label、aliases、children。"
        "children 继续使用相同结构。"
        "要求："
        "1. 根节点是当前章节；"
        "2. 最多3层；"
        "3. 一级节点 3-5 个，二级节点每个 2-4 个；"
        "4. 节点名称简短，适合中小学生阅读；"
        "5. aliases 中给出 2-4 个可用于匹配作业/错题的关键词。"
    )

    user_prompt = (
        f"学科：{normalized_subject}\n"
        f"章节标题：{chapter_title}\n"
        "请围绕教材内容提炼知识结构，不要输出解释文字。\n\n"
        f"章节内容：\n{_sample_text(chapter_content, max_chars=12000, segments=5)}"
    )

    try:
        raw = await _chat_json(
            request,
            user,
            task_model_id,
            system_prompt,
            user_prompt,
            "knowledge_chapter_mindmap_generation",
        )
    except Exception as exc:
        log.warning(
            "Chapter mindmap generation fallback for %s: %s",
            chapter_title,
            exc,
        )
        raw = {"label": chapter_title, "children": _default_children_from_title(chapter_title)}

    tree_data = _normalize_tree_data(raw, chapter_title)
    markmap_markdown = build_markmap_markdown(tree_data)
    return {"tree_data": tree_data, "markmap_markdown": markmap_markdown}


def build_chapter_mindmap_form(
    chapter_title: str,
    chapter_start_page: int,
    chapter_end_page: int,
    subject: Optional[str],
    tree_data: dict,
    markmap_markdown: str,
) -> FileChapterMindmapCreateForm:
    return FileChapterMindmapCreateForm(
        chapter_title=chapter_title,
        chapter_start_page=chapter_start_page,
        chapter_end_page=chapter_end_page,
        subject=subject,
        tree_data=tree_data,
        markmap_markdown=markmap_markdown,
    )


def update_chapter_mindmap_from_homework_results(
    file_id: str,
    chapter_title: Optional[str],
    chapter_start_page: Optional[int],
    chapter_end_page: Optional[int],
    results: list[dict],
    knowledge_points: Optional[list[str]] = None,
    db: Optional[Session] = None,
):
    mindmap = FileChapterMindmaps.get_mindmap_by_file_and_chapter(
        file_id=file_id,
        chapter_title=chapter_title,
        chapter_start_page=chapter_start_page,
        chapter_end_page=chapter_end_page,
        db=db,
    )
    if not mindmap:
        return None

    tree_data = mindmap.tree_data or {}
    context_terms = " ".join(str(item) for item in (knowledge_points or [])[:6])

    for result in results or []:
        text = " ".join(
            [
                str(result.get("question") or ""),
                str(result.get("analysis") or ""),
                str(result.get("standard_answer") or ""),
                context_terms,
            ]
        )
        matches = _find_matching_nodes(tree_data, text)
        for index, node in enumerate(matches):
            weight = 1.0 if index == 0 else (0.7 if index == 1 else 0.45)
            _apply_mastery_delta(node, bool(result.get("is_correct")), weight)

    markmap_markdown = build_markmap_markdown(tree_data)
    return FileChapterMindmaps.update_mindmap_by_id(
        mindmap.id,
        FileChapterMindmapUpdateForm(
            tree_data=tree_data,
            markmap_markdown=markmap_markdown,
        ),
        db=db,
    )


def update_chapter_mindmap_from_wrong_question(
    file_id: str,
    chapter_title: Optional[str],
    question_text: str,
    is_correct: bool,
    weight: float = 1.0,
    db: Optional[Session] = None,
):
    mindmap = FileChapterMindmaps.get_mindmap_by_file_and_chapter(
        file_id=file_id,
        chapter_title=chapter_title,
        db=db,
    )
    if not mindmap:
        return None

    tree_data = mindmap.tree_data or {}
    matches = _find_matching_nodes(tree_data, question_text)
    for index, node in enumerate(matches):
        apply_weight = weight if index == 0 else max(0.35, weight * 0.5)
        _apply_mastery_delta(node, is_correct=is_correct, weight=apply_weight)

    markmap_markdown = build_markmap_markdown(tree_data)
    return FileChapterMindmaps.update_mindmap_by_id(
        mindmap.id,
        FileChapterMindmapUpdateForm(
            tree_data=tree_data,
            markmap_markdown=markmap_markdown,
        ),
        db=db,
    )
