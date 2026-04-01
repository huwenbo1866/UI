from __future__ import annotations

import copy
import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from open_webui.env import LEARNING_CAPABILITIES_CONFIG_PATH
from open_webui.models.chat_messages import ChatMessages


CAPABILITY_SCORE_LABEL = "成长指数"
RECENT_MESSAGE_LIMIT = 120
log = logging.getLogger(__name__)


CAPABILITY_DEFINITIONS = [
    {
        "key": "divergent_thinking",
        "label": "思维发散性",
        "description": "鼓励从多个角度思考问题，学会比较、联想、追问和提出不同解法。",
        "prompt": (
            "你正在帮助一名中小学生培养思维发散性。回答时优先使用启发式表达，不要只给唯一答案。"
            "请根据学生年级和学科场景，适度加入“还可以怎么想”“还有没有别的方法”“如果换个条件会怎样”"
            "这类引导，鼓励学生比较不同方案、发现联系、提出追问。结论要清晰，但要保留探索空间。"
        ),
        "signals": [
            "为什么",
            "怎么",
            "如何",
            "如果",
            "还能",
            "还有",
            "不同",
            "方法",
            "联系",
            "比较",
            "除了",
            "举例",
            "可能",
            "方案",
        ],
    },
    {
        "key": "creativity",
        "label": "创新性",
        "description": "鼓励提出新点子、新作品和新方案，把已有知识迁移到新的任务里。",
        "prompt": (
            "你正在帮助一名中小学生培养创新性。回答时在保证知识正确的前提下，鼓励原创表达、方案设计和"
            "创意迁移。可以引导学生进行改造、创作、设计、重组和想象，但表达要具体、可执行、适合学生年龄。"
        ),
        "signals": [
            "设计",
            "创作",
            "创新",
            "想象",
            "发明",
            "改造",
            "灵感",
            "作品",
            "试试",
            "方案",
            "创意",
            "重组",
            "改进",
        ],
    },
    {
        "key": "scientific_literacy",
        "label": "科学素养",
        "description": "强调观察、假设、实验、数据和证据，让学生理解科学探究过程。",
        "prompt": (
            "你正在帮助一名中小学生培养科学素养。回答时优先体现观察、提问、假设、验证、测量、数据分析和"
            "证据推理。遇到科学问题时，不只给结论，还要说明可以怎样验证、记录和比较结果。"
        ),
        "signals": [
            "实验",
            "观察",
            "假设",
            "验证",
            "测量",
            "数据",
            "变量",
            "结论",
            "原理",
            "现象",
            "证据",
            "记录",
            "推测",
        ],
    },
    {
        "key": "artistic_literacy",
        "label": "艺术素养",
        "description": "帮助学生感受美、表达美，提升审美观察和艺术表达能力。",
        "prompt": (
            "你正在帮助一名中小学生培养艺术素养。回答时注意审美感受、形象表达和艺术语言，可以从色彩、节奏、"
            "构图、意境、风格和情绪等角度引导学生观察与表达，让回答更具画面感和感受力。"
        ),
        "signals": [
            "色彩",
            "构图",
            "节奏",
            "旋律",
            "表演",
            "审美",
            "画面",
            "意境",
            "风格",
            "音乐",
            "绘画",
            "舞蹈",
            "诗歌",
        ],
    },
    {
        "key": "experiential_learning",
        "label": "体验性",
        "description": "把知识和生活场景连接起来，引导学生动手做、亲身体验和反思。",
        "prompt": (
            "你正在帮助一名中小学生培养体验性学习能力。回答时尽量把知识连接到真实生活、实践任务和动手活动，"
            "鼓励学生去观察、记录、体验、合作和复盘，让学习从“知道”走向“做到”。"
        ),
        "signals": [
            "体验",
            "实践",
            "动手",
            "调查",
            "参观",
            "记录",
            "观察日记",
            "合作",
            "活动",
            "任务",
            "项目",
            "尝试",
            "生活",
        ],
    },
    {
        "key": "physical_literacy",
        "label": "体育素养",
        "description": "关注运动意识、身体感知和健康习惯，鼓励科学运动与自我管理。",
        "prompt": (
            "你正在帮助一名中小学生培养体育素养。回答时可以结合运动习惯、动作要领、健康管理和团队协作，"
            "鼓励学生形成规律锻炼、科学训练和安全意识。"
        ),
        "signals": [
            "运动",
            "锻炼",
            "体能",
            "动作",
            "健康",
            "训练",
            "比赛",
            "耐力",
            "协调",
            "习惯",
            "拉伸",
            "安全",
        ],
    },
    {
        "key": "interdisciplinary_learning",
        "label": "跨学科学习",
        "description": "引导学生把不同学科知识联系起来，形成综合理解和迁移应用能力。",
        "prompt": (
            "你正在帮助一名中小学生培养跨学科学习能力。回答时适度指出不同学科之间的联系，把课本知识和现实问题、"
            "不同学科视角结合起来，让学生看到知识之间的连接，而不是孤立记忆。"
        ),
        "signals": [
            "跨学科",
            "联系",
            "结合",
            "综合",
            "迁移",
            "应用",
            "现实问题",
            "数学",
            "科学",
            "语文",
            "艺术",
            "生活",
        ],
    },
]

QUESTION_SIGNALS = ["?", "？", "为什么", "怎么", "如何", "能不能", "可不可以"]
FOLLOW_UP_SIGNALS = ["还有", "还能", "如果", "除了", "换一种", "是否", "比较"]

DEFAULT_LEARNING_CAPABILITIES_CONFIG = {
    "metric_label": CAPABILITY_SCORE_LABEL,
    "recent_message_limit": RECENT_MESSAGE_LIMIT,
    "question_signals": QUESTION_SIGNALS,
    "follow_up_signals": FOLLOW_UP_SIGNALS,
    "capabilities": CAPABILITY_DEFINITIONS,
}


def _normalize_string_list(values: Any, fallback: list[str]) -> list[str]:
    if not isinstance(values, list):
        return fallback

    normalized_values = [
        value.strip() for value in values if isinstance(value, str) and value.strip()
    ]
    return normalized_values or fallback


def _normalize_capability_definitions(
    values: Any, fallback: list[dict]
) -> list[dict]:
    if not isinstance(values, list):
        return fallback

    normalized_capabilities = []
    for capability in values:
        if not isinstance(capability, dict):
            continue

        key = capability.get("key")
        label = capability.get("label")
        prompt = capability.get("prompt")
        description = capability.get("description", "")
        signals = _normalize_string_list(capability.get("signals"), [])
        
        follow_up_guidance = capability.get("follow_up_guidance", "")
        suggestion_prompts = capability.get("suggestion_prompts", [])

        normalized_suggestion_prompts = []
        if isinstance(suggestion_prompts, list):
            for item in suggestion_prompts:
                if not isinstance(item, dict):
                    continue

                title = item.get("title")
                content = item.get("content")
                if (
                    isinstance(title, list)
                    and len(title) == 2
                    and all(isinstance(t, str) and t.strip() for t in title)
                    and isinstance(content, str)
                    and content.strip()
                ):
                    normalized_suggestion_prompts.append(
                        {
                            "title": [title[0].strip(), title[1].strip()],
                            "content": content.strip(),
                        }
                    )


        if not (
            isinstance(key, str)
            and key.strip()
            and isinstance(label, str)
            and label.strip()
            and isinstance(prompt, str)
            and prompt.strip()
            and signals
        ):
            continue

        normalized_capabilities.append(
            {
                "key": key.strip(),
                "label": label.strip(),
                "description": description.strip()
                if isinstance(description, str)
                else "",
                "prompt": prompt.strip(),
                "signals": signals,
                "follow_up_guidance": follow_up_guidance.strip()
                if isinstance(follow_up_guidance, str)
                else "",
                "suggestion_prompts": normalized_suggestion_prompts,
            }
        )

    return normalized_capabilities or fallback


def _load_learning_capabilities_config() -> dict:
    config = copy.deepcopy(DEFAULT_LEARNING_CAPABILITIES_CONFIG)

    if not LEARNING_CAPABILITIES_CONFIG_PATH.exists():
        log.info(
            "Learning capabilities config not found at %s, using built-in defaults.",
            LEARNING_CAPABILITIES_CONFIG_PATH,
        )
        return config

    try:
        loaded_config = json.loads(
            LEARNING_CAPABILITIES_CONFIG_PATH.read_text(encoding="utf-8")
        )
        if not isinstance(loaded_config, dict):
            raise ValueError("learning capabilities config must be a JSON object")

        metric_label = loaded_config.get("metric_label")
        if isinstance(metric_label, str) and metric_label.strip():
            config["metric_label"] = metric_label.strip()

        recent_message_limit = loaded_config.get("recent_message_limit")
        if isinstance(recent_message_limit, int) and recent_message_limit > 0:
            config["recent_message_limit"] = recent_message_limit

        config["question_signals"] = _normalize_string_list(
            loaded_config.get("question_signals"),
            config["question_signals"],
        )
        config["follow_up_signals"] = _normalize_string_list(
            loaded_config.get("follow_up_signals"),
            config["follow_up_signals"],
        )
        config["capabilities"] = _normalize_capability_definitions(
            loaded_config.get("capabilities"),
            config["capabilities"],
        )

        log.info(
            "Loaded learning capabilities config from %s",
            LEARNING_CAPABILITIES_CONFIG_PATH,
        )
    except Exception as exc:
        log.warning(
            "Failed to load learning capabilities config from %s, using built-in defaults: %s",
            LEARNING_CAPABILITIES_CONFIG_PATH,
            exc,
        )

    return config


LEARNING_CAPABILITIES_CONFIG = _load_learning_capabilities_config()
CAPABILITY_SCORE_LABEL = LEARNING_CAPABILITIES_CONFIG["metric_label"]
RECENT_MESSAGE_LIMIT = LEARNING_CAPABILITIES_CONFIG["recent_message_limit"]
QUESTION_SIGNALS = LEARNING_CAPABILITIES_CONFIG["question_signals"]
FOLLOW_UP_SIGNALS = LEARNING_CAPABILITIES_CONFIG["follow_up_signals"]
CAPABILITY_DEFINITIONS = LEARNING_CAPABILITIES_CONFIG["capabilities"]
CAPABILITY_MAP = {item["key"]: item for item in CAPABILITY_DEFINITIONS}


def _coerce_dict(value: Any) -> dict:
    if isinstance(value, dict):
        return value

    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
            return dumped if isinstance(dumped, dict) else {}
        except Exception:
            return {}

    if hasattr(value, "dict"):
        try:
            dumped = value.dict()
            return dumped if isinstance(dumped, dict) else {}
        except Exception:
            return {}

    return {}


def _extract_text_from_content(content: Any) -> str:
    if content is None:
        return ""

    if isinstance(content, str):
        return content

    if isinstance(content, dict):
        if isinstance(content.get("text"), str):
            return content["text"]
        return json.dumps(content, ensure_ascii=False)

    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, str):
                texts.append(item)
                continue

            if not isinstance(item, dict):
                continue

            if isinstance(item.get("text"), str):
                texts.append(item["text"])
                continue

            if item.get("type") in {"text", "input_text", "output_text"} and isinstance(
                item.get("text"), str
            ):
                texts.append(item["text"])

        return "\n".join([text for text in texts if text])

    return str(content)


def _get_settings(user: Any) -> dict:
    if isinstance(user, dict):
        settings = user.get("settings")
    else:
        settings = getattr(user, "settings", None)

    return _coerce_dict(settings)


def get_learning_profile_settings(user_or_settings: Any) -> dict:
    candidate = _coerce_dict(user_or_settings)

    if candidate:
        if "settings" in candidate and "ui" not in candidate:
            settings = _get_settings(candidate)
        else:
            settings = candidate
    else:
        settings = _get_settings(user_or_settings)

    ui_settings = settings.get("ui")

    if not isinstance(ui_settings, dict):
        return {}

    learning_profile = ui_settings.get("learning_profile")
    return learning_profile if isinstance(learning_profile, dict) else {}


def get_selected_learning_capability(user_or_settings: Any) -> Optional[str]:
    learning_profile = get_learning_profile_settings(user_or_settings)
    capability = learning_profile.get("selected_capability")
    return capability if capability in CAPABILITY_MAP else None


def build_learning_profile_settings(
    existing_settings: Optional[dict], selected_capability: Optional[str]
) -> dict:
    settings = copy.deepcopy(existing_settings) if isinstance(existing_settings, dict) else {}
    ui_settings = settings.get("ui")
    if not isinstance(ui_settings, dict):
        ui_settings = {}

    learning_profile = ui_settings.get("learning_profile")
    if not isinstance(learning_profile, dict):
        learning_profile = {}

    learning_profile["selected_capability"] = (
        selected_capability if selected_capability in CAPABILITY_MAP else None
    )
    ui_settings["learning_profile"] = learning_profile
    settings["ui"] = ui_settings

    return settings


def get_learning_capability_system_prompt(user: Any) -> Optional[str]:
    selected_capability = get_selected_learning_capability(user)
    if not selected_capability:
        return None

    capability = CAPABILITY_MAP.get(selected_capability)
    if not capability:
        return None

    return capability["prompt"]

def get_learning_capability_response_contract(user_or_settings: Any) -> Optional[str]:
    capability = get_selected_learning_capability_definition(user_or_settings)
    if not capability:
        return None

    label = capability.get("label", "").strip()
    signals = capability.get("signals", [])
    normalized_signals = [
        signal.strip() for signal in signals if isinstance(signal, str) and signal.strip()
    ][:8]

    if not label:
        return None

    signal_text = "、".join(normalized_signals)
    return (
        f"【{label}个性化执行协议】\n"
        f"- 每次回答必须显式体现“{label}”方向（不能只给通用讲解）。\n"
        "- 每次回答至少包含1个方向化引导句 + 1个可执行学习动作。\n"
        "- 当题目允许时，优先提供“另一种思路/变式条件/迁移场景”中的至少1项。\n"
        f"- 可优先使用这些方向关键词或动作：{signal_text}。"
    )


def get_selected_learning_capability_definition(user_or_settings: Any) -> Optional[dict]:
    selected_capability = get_selected_learning_capability(user_or_settings)
    if not selected_capability:
        return None
    return CAPABILITY_MAP.get(selected_capability)


def get_learning_capability_follow_up_guidance(user_or_settings: Any) -> Optional[str]:
    capability = get_selected_learning_capability_definition(user_or_settings)
    if not capability:
        return None

    guidance = capability.get("follow_up_guidance")
    if isinstance(guidance, str) and guidance.strip():
        return guidance.strip()

    return None


def get_learning_capability_suggestion_prompts(user_or_settings: Any) -> list[dict]:
    capability = get_selected_learning_capability_definition(user_or_settings)
    if not capability:
        return []

    suggestions = capability.get("suggestion_prompts")
    return suggestions if isinstance(suggestions, list) else []

def _compute_capability_score(texts: list[str], signals: list[str]) -> float:
    if not texts:
        return 0.2

    matched_messages = 0
    unique_hits: set[str] = set()
    question_like_messages = 0
    follow_up_messages = 0
    text_depth = 0.0

    for text in texts:
        compact_text = text.strip()
        if not compact_text:
            continue

        hit_signals = [signal for signal in signals if signal in compact_text]
        if hit_signals:
            matched_messages += 1
            unique_hits.update(hit_signals)

        if any(signal in compact_text for signal in QUESTION_SIGNALS):
            question_like_messages += 1

        if any(signal in compact_text for signal in FOLLOW_UP_SIGNALS):
            follow_up_messages += 1

        text_depth += min(len(compact_text) / 80.0, 1.0)

    total_messages = max(len(texts), 1)
    coverage_score = matched_messages / total_messages
    variety_score = len(unique_hits) / max(len(signals), 1)
    curiosity_score = question_like_messages / total_messages
    follow_up_score = follow_up_messages / total_messages
    depth_score = text_depth / total_messages
    engagement_score = min(total_messages / 12.0, 1.0)

    raw_score = (
        0.18
        + coverage_score * 0.32
        + variety_score * 0.2
        + curiosity_score * 0.12
        + follow_up_score * 0.08
        + depth_score * 0.1
    )
    confidence = 0.65 + engagement_score * 0.35
    final_score = max(0.1, min(raw_score * confidence, 0.98))

    return round(final_score, 1)


def get_learning_profile(user_id: str, settings: Optional[dict], db: Optional[Session] = None):
    messages = ChatMessages.get_messages_by_user_id(
        user_id=user_id,
        limit=RECENT_MESSAGE_LIMIT,
        db=db,
    )

    user_texts = []
    for message in messages:
        if message.role != "user":
            continue

        text = _extract_text_from_content(message.content).strip()
        if text:
            user_texts.append(text)

    selected_capability = get_selected_learning_capability(settings)

    capabilities = []
    for capability in CAPABILITY_DEFINITIONS:
        score = _compute_capability_score(user_texts, capability["signals"])
        capabilities.append(
            {
                "key": capability["key"],
                "label": capability["label"],
                "description": capability["description"],
                "score": score,
                "selected": capability["key"] == selected_capability,
            }
        )

    capabilities.sort(
        key=lambda capability: (
            capability["key"] != selected_capability,
            -capability["score"],
            capability["label"],
        )
    )

    return {
        "metric_label": CAPABILITY_SCORE_LABEL,
        "sample_count": len(user_texts),
        "selected_capability": selected_capability,
        "capabilities": capabilities,
    }
