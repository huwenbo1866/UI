from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
from pathlib import Path
from threading import Lock
import time
from typing import Any

from open_webui.brain.router.xiaoling_personalization_brain_router_v2 import (
    XiaoLingPersonalizationBrain,
)
from open_webui.models.users import Users
from open_webui.utils.misc import add_or_update_system_message

log = logging.getLogger(__name__)

_BRAIN_LOCK = Lock()
_BRAIN_INSTANCE: XiaoLingPersonalizationBrain | None = None
_BRAIN_ARTIFACT_PATH: str | None = None
_ROW_PROCESS_LOCK = Lock()


def _brain_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def _row_process_dir() -> Path:
    return _brain_dir() / "row_process"


def _row_process_jsonl_path() -> Path:
    return _row_process_dir() / "chat_messages_raw_large_v3.jsonl"


def _runtime_state_path() -> Path:
    return _row_process_dir() / "personalization_runtime_state.json"


def _ensure_runtime_dirs() -> None:
    _row_process_dir().mkdir(parents=True, exist_ok=True)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _safe_float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except Exception:
        return default


def _user_runtime_personalization_enabled(user_id: str) -> bool:
    if not user_id:
        return True

    try:
        user = Users.get_user_by_id(user_id)
        if not user or not isinstance(user.settings, dict):
            return True

        ui_settings = user.settings.get("ui")
        if not isinstance(ui_settings, dict):
            return True

        learning_profile = ui_settings.get("learning_profile")
        if not isinstance(learning_profile, dict):
            return True

        flag = learning_profile.get("personalization_runtime_enabled")
        if isinstance(flag, bool):
            return flag
        return True
    except Exception:
        return True


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, str):
                    chunks.append(text)
        return "\n".join(chunks)
    return ""


def _keyword_count(text: str, keywords: list[str]) -> int:
    lower = text.lower()
    return int(sum(lower.count(kw) for kw in keywords))


def _estimate_features_from_messages(messages: list[dict[str, Any]]) -> dict[str, Any]:
    user_texts = [_message_text(m) for m in messages if m.get("role") == "user"]
    assistant_texts = [_message_text(m) for m in messages if m.get("role") == "assistant"]

    user_msg_count = len(user_texts)
    assistant_msg_count = len(assistant_texts)

    if user_msg_count == 0:
        user_texts = [""]
        user_msg_count = 1
    if assistant_msg_count == 0:
        assistant_texts = [""]
        assistant_msg_count = 1

    user_char_total = sum(len(t) for t in user_texts)
    assistant_char_total = sum(len(t) for t in assistant_texts)

    avg_user_msg_len = user_char_total / max(1, user_msg_count)
    avg_output_tokens = (assistant_char_total / max(1, assistant_msg_count)) / 4.0

    merged_user_text = "\n".join(user_texts)
    art_keywords = [
        "art",
        "draw",
        "painting",
        "design",
        "illustration",
        "aesthetic",
        "style",
        "creative",
        "image",
        "visual",
        "艺术",
        "审美",
        "构图",
        "色彩",
        "画面",
        "风格",
        "创作",
        "绘画",
    ]
    confusion_keywords = [
        "confused",
        "not sure",
        "unsure",
        "help",
        "dont know",
        "don't know",
        "how to",
        "stuck",
        "unclear",
        "difficult",
        "不会",
        "看不懂",
        "太难",
        "不理解",
        "不知道",
    ]

    art_kw_count = _keyword_count(merged_user_text, art_keywords)
    confusion_kw_count = _keyword_count(merged_user_text, confusion_keywords)

    followup_depth_proxy = max(user_msg_count - 1, 0)

    conversation_span_minutes = user_msg_count * 1.8 + assistant_msg_count * 1.2

    user_msg_count = int(_clamp(user_msg_count, 2, 12))
    assistant_msg_count = int(_clamp(assistant_msg_count, 1, 12))
    avg_user_msg_len = float(_clamp(avg_user_msg_len, 12.0, 160.0))
    avg_output_tokens = float(_clamp(avg_output_tokens, 40.0, 600.0))
    conversation_span_minutes = float(_clamp(conversation_span_minutes, 0.5, 120.0))
    art_kw_count = int(_clamp(art_kw_count, 0, 20))
    confusion_kw_count = int(_clamp(confusion_kw_count, 0, 10))

    art_keyword_ratio = art_kw_count / max(1, user_msg_count)
    confusion_ratio = confusion_kw_count / max(1, user_msg_count)

    return {
        "user_msg_count": user_msg_count,
        "avg_user_msg_len": avg_user_msg_len,
        "art_kw_count": art_kw_count,
        "confusion_kw_count": confusion_kw_count,
        "assistant_msg_count": assistant_msg_count,
        "avg_output_tokens": avg_output_tokens,
        "conversation_span_minutes": conversation_span_minutes,
        "followup_depth_proxy": followup_depth_proxy,
        "art_keyword_ratio": art_keyword_ratio,
        "confusion_ratio": confusion_ratio,
    }


def _resolve_artifact_path() -> Path:
    configured = os.getenv("BRAIN_ARTIFACT_PATH", "").strip()
    if configured:
        return Path(configured)

    return (
        _brain_dir()
        / "model"
        / "xiaoling_personalization_brain_v4_legacy_eval_optimized.joblib"
    )


def _get_brain(artifact_path: Path) -> XiaoLingPersonalizationBrain:
    global _BRAIN_INSTANCE, _BRAIN_ARTIFACT_PATH

    key = str(artifact_path.resolve())
    if _BRAIN_INSTANCE is not None and _BRAIN_ARTIFACT_PATH == key:
        return _BRAIN_INSTANCE

    with _BRAIN_LOCK:
        if _BRAIN_INSTANCE is not None and _BRAIN_ARTIFACT_PATH == key:
            return _BRAIN_INSTANCE

        if not artifact_path.exists():
            raise FileNotFoundError(f"Brain artifact not found: {artifact_path}")

        _BRAIN_INSTANCE = XiaoLingPersonalizationBrain(artifact_path)
        _BRAIN_ARTIFACT_PATH = key
        log.info("Loaded personalization brain artifact: %s", key)
        return _BRAIN_INSTANCE


def _sample_hit(identity: str, sample_rate: float) -> bool:
    if sample_rate >= 1.0:
        return True
    if sample_rate <= 0.0:
        return False

    digest = hashlib.sha1(identity.encode("utf-8")).hexdigest()
    bucket = int(digest[:8], 16) / 0xFFFFFFFF
    return bucket <= sample_rate


def _learning_scene_hit(messages: list[dict[str, Any]]) -> bool:
    text = "\n".join(_message_text(m) for m in messages if m.get("role") == "user").lower()
    keywords = [
        "作业",
        "题目",
        "学习",
        "课堂",
        "作文",
        "阅读",
        "解释",
        "怎么写",
        "怎么做",
        "理解",
        "数学",
        "语文",
        "英语",
        "science",
        "homework",
        "study",
        "assignment",
        "learn",
    ]
    return any(k in text for k in keywords)


def _negative_feedback_hit(messages: list[dict[str, Any]]) -> bool:
    text = "\n".join(_message_text(m) for m in messages if m.get("role") == "user").lower()
    flags = [
        "看不懂",
        "太复杂",
        "太难",
        "跑题",
        "听不懂",
        "不会",
        "没懂",
        "confused",
        "too hard",
        "not clear",
        "off topic",
    ]
    return any(k in text for k in flags)


def _wude_dimension(messages: list[dict[str, Any]]) -> str:
    text = "\n".join(_message_text(m) for m in messages if m.get("role") == "user").lower()
    if not text:
        return "zhi"

    keyword_map: dict[str, list[str]] = {
        "de": [
            "德",
            "品德",
            "礼貌",
            "规则",
            "诚信",
            "责任",
            "公德",
            "尊重",
            "合作",
            "同理",
            "冲突",
            "情绪",
            "沟通",
            "同学",
            "朋友",
            "班级",
            "校园",
            "civic",
            "ethic",
            "character",
            "manners",
            "respect",
            "cooperate",
            "emotion",
            "communication",
        ],
        "zhi": [
            "智",
            "学习",
            "作业",
            "题目",
            "数学",
            "语文",
            "英语",
            "科学",
            "阅读",
            "理解",
            "记忆",
            "复习",
            "错题",
            "考试",
            "计划",
            "方法",
            "总结",
            "思路",
            "study",
            "homework",
            "math",
            "science",
            "review",
            "exam",
            "plan",
            "method",
        ],
        "ti": [
            "体",
            "体育",
            "运动",
            "锻炼",
            "跑步",
            "健康",
            "体能",
            "睡眠",
            "作息",
            "久坐",
            "拉伸",
            "护眼",
            "姿势",
            "呼吸",
            "放松",
            "exercise",
            "sport",
            "fitness",
            "health",
            "sleep",
            "posture",
            "stretch",
            "relax",
        ],
        "mei": [
            "美",
            "艺术",
            "审美",
            "绘画",
            "音乐",
            "构图",
            "色彩",
            "表达",
            "想象",
            "创意",
            "设计",
            "节奏",
            "写作",
            "朗读",
            "故事",
            "aesthetic",
            "art",
            "painting",
            "music",
            "design",
            "creative",
            "expression",
            "story",
        ],
        "lao": [
            "劳",
            "劳动",
            "实践",
            "家务",
            "整理",
            "手工",
            "种植",
            "收纳",
            "清洁",
            "做饭",
            "工具",
            "任务",
            "值日",
            "项目",
            "动手",
            "clean",
            "housework",
            "craft",
            "practice",
            "project",
            "task",
            "hands-on",
            "organize",
        ],
    }

    scores = {k: _keyword_count(text, v) for k, v in keyword_map.items()}
    if max(scores.values()) <= 0:
        return "zhi"
    return max(scores.items(), key=lambda kv: kv[1])[0]


def _strategy_prompt(strategy_id: str, wude_dimension: str) -> str:
    prompt_map = {
        "de": {
            "primary": (
                "你正在辅导一名中小学生，当前重点是【德育】。"
                "请先解决学生当下问题，再自然补一个品格点（责任、诚信、尊重、合作四选一）。"
                "输出顺序：先可执行答案，再一句价值提醒，最后给今天能完成的小行动。"
                "语气温和具体，不说教、不贴标签。"
            ),
            "complement": (
                "你正在辅导一名中小学生，当前重点是【德育】。"
                "若学生在同伴关系、情绪或冲突中卡住，请先共情，再给一句可直接说出口的沟通句式。"
                "最后补一个“下次遇到类似情况怎么做”的微策略，帮助形成稳定行为习惯。"
            ),
        },
        "zhi": {
            "primary": (
                "你正在辅导一名中小学生，当前重点是【智育】。"
                "知识讲解要清晰不过载：先一句话结论，再给分步骤做法。"
                "每一步都短且可照做，结尾补一个1-2分钟微练习。"
            ),
            "complement": (
                "你正在辅导一名中小学生，当前重点是【智育】。"
                "如果学生容易卡题，请额外给“检查清单版”答案：读题点、关键信息、常见错点、自检顺序。"
                "目标是提升迁移能力，而不是只做完这一题。"
            ),
        },
        "ti": {
            "primary": (
                "你正在辅导一名中小学生，当前重点是【体育】。"
                "先完成学习任务，再给一个低负担、可立即执行的健康建议。"
                "建议应安全、简单、可持续，强调小步开始。"
            ),
            "complement": (
                "你正在辅导一名中小学生，当前重点是【体育】。"
                "如果问题与疲劳或注意力下降有关，请补一个学习节律方案（学习-休息-恢复）。"
                "用可量化的小目标描述，如“先做2分钟拉伸再继续”。"
            ),
        },
        "mei": {
            "primary": (
                "你正在辅导一名中小学生，当前重点是【美育】。"
                "先保证答案对作业直接有用，再补一个表达或审美优化点。"
                "优先用生活化说明，并给可直接套用的小示例。"
            ),
            "complement": (
                "你正在辅导一名中小学生，当前重点是【美育】。"
                "当学生表达单一时，请提供“基础版+创意版”两个答案模板，帮助其做风格选择。"
                "目标是提升表达自信，不走专业艺术训练路线。"
            ),
        },
        "lao": {
            "primary": (
                "你正在辅导一名中小学生，当前重点是【劳育】。"
                "先完成学习目标，再转成一个可落地的小实践任务（家庭或校园都能做）。"
                "任务要有起点、步骤与完成标准，并附简短自查方法。"
            ),
            "complement": (
                "你正在辅导一名中小学生，当前重点是【劳育】。"
                "当学生执行力不足时，请把任务拆成“2分钟起步动作 + 10分钟完成动作”。"
                "强调过程记录与复盘，让动手实践能形成长期习惯。"
            ),
        },
    }

    style_hint = {
        "default_light": "表达风格：尽量简短，3句左右，先给答案。",
        "default_guided": "表达风格：分步骤讲解，每步一句，便于学生跟做。",
        "default_support": "表达风格：先肯定再改进，降低心理负担。",
        "default_strong_support": "表达风格：高陪伴感、低门槛，必要时提供最小可执行版本。",
        "art_light": "表达风格：轻量启发，不增加认知负担。",
        "art_mid": "表达风格：给基础版和进阶版两个选项。",
        "art_deep": "表达风格：结构化拆解3点，仍保持中小学生可理解。",
        "art_deep_plus": "表达风格：亮点+改进+简短自评清单，鼓励自主反思。",
    }.get(strategy_id, "表达风格：清晰、具体、可执行。")

    complementary_strategies = {
        "default_support",
        "default_strong_support",
        "art_mid",
        "art_deep_plus",
    }
    dim_prompts = prompt_map.get(wude_dimension, prompt_map["zhi"])
    base = (
        dim_prompts["complement"]
        if strategy_id in complementary_strategies
        else dim_prompts["primary"]
    )
    return f"{base}{style_hint}"





def _load_runtime_state() -> dict[str, Any]:
    _ensure_runtime_dirs()
    state_path = _runtime_state_path()
    if not state_path.exists():
        return {"users": {}}

    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except Exception:
        return {"users": {}}


def _save_runtime_state(state: dict[str, Any]) -> None:
    _ensure_runtime_dirs()
    state_path = _runtime_state_path()
    tmp_path = state_path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    tmp_path.replace(state_path)


def _append_row_process_record(record: dict[str, Any]) -> None:
    _ensure_runtime_dirs()
    path = _row_process_jsonl_path()
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _safe_strategy_by_confidence(strategy_id: str, path_confidence: float) -> str:
    min_confidence = _safe_float_env("BRAIN_MIN_CONFIDENCE", 0.62)
    if path_confidence < min_confidence:
        return "default_guided"
    return strategy_id


def _smooth_score(user_state: dict[str, Any], raw_score: float) -> float:
    alpha = _safe_float_env("BRAIN_SCORE_EMA_ALPHA", 0.35)
    alpha = _clamp(alpha, 0.05, 1.0)
    prev_ema = float(user_state.get("ema_score", raw_score))
    ema = alpha * raw_score + (1.0 - alpha) * prev_ema
    user_state["ema_score"] = float(ema)
    return float(ema)


def _score_bucket(score: float) -> str:
    if score < 0.35:
        return "light"
    if score < 0.6:
        return "mid"
    if score < 0.8:
        return "deep"
    return "deep_plus"


def _candidate_strategy_by_score(base_strategy: str, score: float, learning_scene: bool) -> str:
    if not learning_scene and base_strategy.startswith("art_"):
        return "default_guided"

    bucket = _score_bucket(score)
    if base_strategy.startswith("art_"):
        mapping = {
            "light": "art_light",
            "mid": "art_mid",
            "deep": "art_deep",
            "deep_plus": "art_deep_plus",
        }
        return mapping[bucket]

    mapping = {
        "light": "default_light",
        "mid": "default_guided",
        "deep": "default_support",
        "deep_plus": "default_strong_support",
    }
    return mapping[bucket]


def _apply_hysteresis(user_state: dict[str, Any], candidate_strategy: str) -> str:
    min_streak = int(_safe_float_env("BRAIN_SWITCH_MIN_STREAK", 2))
    min_streak = int(_clamp(float(min_streak), 1.0, 6.0))

    effective_strategy = str(user_state.get("effective_strategy", candidate_strategy))
    pending_candidate = str(user_state.get("pending_candidate", ""))
    pending_streak = int(user_state.get("pending_streak", 0))

    if candidate_strategy == effective_strategy:
        user_state["pending_candidate"] = candidate_strategy
        user_state["pending_streak"] = 0
        return effective_strategy

    if candidate_strategy == pending_candidate:
        pending_streak += 1
    else:
        pending_candidate = candidate_strategy
        pending_streak = 1

    user_state["pending_candidate"] = pending_candidate
    user_state["pending_streak"] = pending_streak

    if pending_streak >= min_streak:
        effective_strategy = candidate_strategy
        user_state["effective_strategy"] = effective_strategy
        user_state["pending_streak"] = 0

    return effective_strategy


def _infer_growth_trend(score_history: list[float]) -> str:
    if len(score_history) < 6:
        return "flat"

    window = min(len(score_history) // 2, 10)
    early = sum(score_history[-2 * window : -window]) / max(window, 1)
    late = sum(score_history[-window:]) / max(window, 1)
    delta = late - early
    if delta > 0.03:
        return "up"
    if delta < -0.03:
        return "down"
    return "flat"


def _update_growth_settings(user_id: str, score: float, trend: str, batch_id: str) -> None:
    user = Users.get_user_by_id(user_id)
    if not user:
        return

    settings = copy.deepcopy(user.settings) if isinstance(user.settings, dict) else {}
    ui_settings = settings.get("ui")
    if not isinstance(ui_settings, dict):
        ui_settings = {}
    learning_profile = ui_settings.get("learning_profile")
    if not isinstance(learning_profile, dict):
        learning_profile = {}

    learning_profile["personalization_growth"] = {
        "current_score": round(float(score), 4),
        "growth_trend": trend,
        "updated_at": int(time.time()),
        "source_batch_id": batch_id,
    }

    ui_settings["learning_profile"] = learning_profile
    settings["ui"] = ui_settings
    Users.update_user_settings_by_id(user_id, settings)


def _run_batch_inference(
    brain: XiaoLingPersonalizationBrain,
    pending_features: list[dict[str, Any]],
) -> dict[str, Any]:
    if not pending_features:
        return {
            "mean_score": 0.5,
            "dominant_strategy": "default_guided",
            "dominant_path": "default_path",
            "sample_count": 0,
        }

    scores: list[float] = []
    strategy_counts: dict[str, int] = {}
    path_counts: dict[str, int] = {}

    for features in pending_features:
        try:
            d = brain.predict(features)
            scores.append(float(d.predicted_score))
            strategy_counts[d.strategy_id] = strategy_counts.get(d.strategy_id, 0) + 1
            path_counts[d.predicted_path_name] = path_counts.get(d.predicted_path_name, 0) + 1
        except Exception:
            continue

    if not scores:
        return {
            "mean_score": 0.5,
            "dominant_strategy": "default_guided",
            "dominant_path": "default_path",
            "sample_count": 0,
        }

    dominant_strategy = max(strategy_counts.items(), key=lambda kv: kv[1])[0]
    dominant_path = max(path_counts.items(), key=lambda kv: kv[1])[0]
    return {
        "mean_score": float(sum(scores) / len(scores)),
        "dominant_strategy": dominant_strategy,
        "dominant_path": dominant_path,
        "sample_count": len(scores),
    }


def apply_runtime_personalization(
    form_data: dict[str, Any],
    metadata: dict[str, Any],
    logger_obj: logging.Logger | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    logger = logger_obj or log

    user_id = str(metadata.get("user_id") or "")

    if not _env_bool("BRAIN_ENABLED", True):
        return form_data, metadata

    if not _user_runtime_personalization_enabled(user_id):
        return form_data, metadata

    sample_rate = _safe_float_env("BRAIN_SAMPLE_RATE", 1.0)
    sample_rate = _clamp(sample_rate, 0.0, 1.0)

    identity = str(
        metadata.get("chat_id")
        or metadata.get("session_id")
        or metadata.get("user_id")
        or "global"
    )
    if not _sample_hit(identity, float(sample_rate)):
        return form_data, metadata

    try:
        artifact_path = _resolve_artifact_path()
        brain = _get_brain(artifact_path)

        messages = form_data.get("messages") or []
        if not isinstance(messages, list):
            return form_data, metadata

        features = _estimate_features_from_messages(messages)
        decision = brain.predict(features)

        chat_id = str(metadata.get("chat_id") or "")
        session_id = str(metadata.get("session_id") or "")
        now_ts = int(time.time())

        learning_scene = _learning_scene_hit(messages)
        wude_dimension = _wude_dimension(messages)
        negative_feedback = _negative_feedback_hit(messages)

        with _ROW_PROCESS_LOCK:
            state = _load_runtime_state()
            users_state = state.setdefault("users", {})
            user_state = users_state.setdefault(
                user_id or "anonymous",
                {
                    "pending_messages": 0,
                    "pending_features": [],
                    "score_history": [],
                    "ema_score": float(decision.predicted_score),
                    "effective_strategy": str(decision.strategy_id),
                    "pending_candidate": str(decision.strategy_id),
                    "pending_streak": 0,
                },
            )

            user_state["pending_messages"] = int(user_state.get("pending_messages", 0)) + 1
            pending_features = user_state.get("pending_features")
            if not isinstance(pending_features, list):
                pending_features = []
            pending_features.append(features)
            batch_size = int(_safe_float_env("ROW_PROCESS_BATCH_SIZE", 500.0))
            if len(pending_features) > batch_size:
                pending_features = pending_features[-batch_size:]
            user_state["pending_features"] = pending_features

            smoothed_score = _smooth_score(user_state, float(decision.predicted_score))
            score_history = user_state.get("score_history")
            if not isinstance(score_history, list):
                score_history = []
            score_history.append(float(smoothed_score))
            if len(score_history) > 60:
                score_history = score_history[-60:]
            user_state["score_history"] = score_history
            trend = _infer_growth_trend(score_history)

            safe_strategy = _safe_strategy_by_confidence(
                str(decision.strategy_id),
                float(decision.path_confidence),
            )
            candidate_strategy = _candidate_strategy_by_score(
                safe_strategy,
                smoothed_score,
                learning_scene,
            )

            if negative_feedback:
                candidate_strategy = "default_guided"

            effective_strategy = _apply_hysteresis(user_state, candidate_strategy)

            batch_triggered = user_state["pending_messages"] >= batch_size
            batch_summary: dict[str, Any] | None = None
            batch_id = ""
            if batch_triggered:
                batch_features = list(user_state.get("pending_features", []))
                batch_summary = _run_batch_inference(brain, batch_features)
                batch_id = f"batch_{now_ts}_{hashlib.sha1((user_id + str(now_ts)).encode('utf-8')).hexdigest()[:8]}"
                user_state["pending_messages"] = 0
                user_state["pending_features"] = []

                # Batch summary can override strategy when confident enough.
                if batch_summary.get("sample_count", 0) >= max(10, batch_size // 10):
                    effective_strategy = str(batch_summary.get("dominant_strategy", effective_strategy))
                    user_state["effective_strategy"] = effective_strategy

                _update_growth_settings(
                    user_id=user_id,
                    score=float(batch_summary.get("mean_score", smoothed_score)),
                    trend=trend,
                    batch_id=batch_id,
                )

            # Always keep personalization growth updated; batch trigger only enriches source id.
            if user_id and _env_bool("BRAIN_UPDATE_GROWTH_EVERY_CALL", True):
                min_gap = int(_safe_float_env("BRAIN_GROWTH_MIN_UPDATE_SECONDS", 20.0))
                min_gap = max(0, min_gap)
                last_update = int(user_state.get("last_growth_update", 0))
                if now_ts - last_update >= min_gap:
                    source_batch_id = batch_id if batch_id else f"realtime_{now_ts}"
                    _update_growth_settings(
                        user_id=user_id,
                        score=float(smoothed_score),
                        trend=trend,
                        batch_id=source_batch_id,
                    )
                    user_state["last_growth_update"] = now_ts

            record = {
                "timestamp": now_ts,
                "chat_id": chat_id,
                "session_id": session_id,
                "user_id": user_id,
                "feature_snapshot": features,
                "brain_decision": {
                    "predicted_score": float(decision.predicted_score),
                    "predicted_path_class": int(decision.predicted_path_class),
                    "predicted_path_name": str(decision.predicted_path_name),
                    "path_confidence": float(decision.path_confidence),
                    "intensity_bucket": str(decision.intensity_bucket),
                    "raw_strategy_id": str(decision.strategy_id),
                    "effective_strategy_id": effective_strategy,
                    "smoothed_score": float(smoothed_score),
                    "learning_scene": bool(learning_scene),
                    "negative_feedback": bool(negative_feedback),
                    "batch_triggered": bool(batch_triggered),
                    "batch_id": batch_id,
                },
            }
            if batch_summary is not None:
                record["batch_summary"] = batch_summary

            _append_row_process_record(record)
            _save_runtime_state(state)

        features_container = metadata.get("features")
        if not isinstance(features_container, dict):
            features_container = {}
            metadata["features"] = features_container

        features_container["brain_features"] = features
        features_container["brain_decision"] = {
            "predicted_score": float(decision.predicted_score),
            "predicted_path_class": int(decision.predicted_path_class),
            "predicted_path_name": str(decision.predicted_path_name),
            "path_confidence": float(decision.path_confidence),
            "intensity_bucket": str(decision.intensity_bucket),
            "strategy_id": str(effective_strategy),
            "raw_strategy_id": str(decision.strategy_id),
            "smoothed_score": float(smoothed_score),
            "learning_scene": bool(learning_scene),
            "wude_dimension": str(wude_dimension),
            "negative_feedback": bool(negative_feedback),
        }
        features_container["growth"] = {
            "current_score": float(smoothed_score),
            "growth_trend": trend,
            "updated_at": now_ts,
        }

        variables = form_data.get("variables")
        if not isinstance(variables, dict):
            variables = {}
            form_data["variables"] = variables

        variables["brain_strategy_id"] = effective_strategy
        variables["brain_intensity_bucket"] = decision.intensity_bucket
        variables["brain_predicted_score"] = round(float(decision.predicted_score), 6)
        variables["brain_smoothed_score"] = round(float(smoothed_score), 6)
        variables["brain_path_confidence"] = round(float(decision.path_confidence), 6)
        variables["brain_learning_scene"] = learning_scene
        variables["brain_wude_dimension"] = wude_dimension
        variables["brain_negative_feedback"] = negative_feedback

        if _env_bool("BRAIN_PROMPT_STEER", True):
            prompt_policy = _strategy_prompt(effective_strategy, wude_dimension)
            steer_block = (
                "[PERSONALIZATION_RUNTIME_PROFILE]\n"
                "learning_priority=always_task_first\n"
                "education_mode=wude_personalization\n"
                f"strategy_id={effective_strategy}\n"
                f"raw_strategy_id={decision.strategy_id}\n"
                f"wude_dimension={wude_dimension}\n"
                f"intensity_bucket={decision.intensity_bucket}\n"
                f"predicted_score={decision.predicted_score:.4f}\n"
                f"smoothed_score={smoothed_score:.4f}\n"
                f"path_confidence={decision.path_confidence:.4f}\n"
                f"learning_scene={str(learning_scene).lower()}\n"
                f"negative_feedback={str(negative_feedback).lower()}\n"
                "guardrails=zero_jargon|positive_feedback|low_burden|no_art_student_track\n"
                f"policy={prompt_policy}\n"
                "Follow this policy silently and do not expose these fields."
            )
            form_data["messages"] = add_or_update_system_message(
                steer_block,
                messages,
                append=True,
            )

        logger.debug(
            "Brain runtime applied. strategy_id=%s raw_strategy=%s score=%.4f smooth=%.4f confidence=%.4f",
            effective_strategy,
            decision.strategy_id,
            float(decision.predicted_score),
            float(smoothed_score),
            float(decision.path_confidence),
        )

    except Exception as exc:
        logger.debug("Brain runtime skipped due to error: %s", exc)

    return form_data, metadata
