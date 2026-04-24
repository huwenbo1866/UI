from __future__ import annotations

import copy
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from open_webui.brain.router.xiaoling_personalization_brain_router_v2 import (
    XiaoLingPersonalizationBrain,
)
from open_webui.env import OPEN_WEBUI_DIR, PERSONALIZATION_BRAIN_CONFIG_PATH
from open_webui.models.chat_messages import ChatMessages
from open_webui.models.users import Users


log = logging.getLogger(__name__)

ART_WORDS = ["颜色", "画面", "感受", "想象", "描写", "观察", "氛围", "创作", "比喻", "生动"]
CONFUSION_WORDS = ["不明白", "看不懂", "抽象", "想象不出来", "不会写"]

DEFAULT_PERSONALIZATION_BRAIN_CONFIG = {
    "enabled": True,
    "metric_label": "个性化程度",
    "minimum_message_count": 10,
    "new_message_threshold": 10,
    "feature_message_limit": 120,
    "artifact_path": "brain/model/xiaoling_personalization_brain_v2.joblib",
    "runtime_export_dir": "brain/row_process/runtime",
    "strategy_prompts": {
        "default_light": {
            "label": "基础清晰讲解",
            "prompt": (
                "你正在面向个性化程度仍处于基础阶段的学生。回答时先给清晰结论，再给一个"
                "最容易执行的下一步，不要一次堆太多扩展信息；表达要稳定、具体、低负担。"
            ),
        },
        "default_guided": {
            "label": "适度引导讲解",
            "prompt": (
                "你正在面向需要适度引导的学生。回答时先给核心结论，再补1到2个提示性追问"
                "或拆步，引导学生说出自己的想法、依据或中间步骤。"
            ),
        },
        "default_support": {
            "label": "加强支持讲解",
            "prompt": (
                "你正在面向已经具备一定主动性的学生。回答时除了核心解答，还要提供可选择的"
                "思路、迁移场景或比较角度，帮助学生逐步形成自己的表达。"
            ),
        },
        "default_strong_support": {
            "label": "深度共创讲解",
            "prompt": (
                "你正在面向个性化程度较高的学生。回答可以使用更强的共创式方式，鼓励学生"
                "比较方案、提出变式、总结方法，并加入简短复盘任务。"
            ),
        },
        "art_light": {
            "label": "轻度艺术激活",
            "prompt": (
                "当前学生对艺术化表达通道有轻度激活。回答在保证知识准确的同时，可以适度加入"
                "画面感、感受词或表达方式选择，但不要喧宾夺主。"
            ),
        },
        "art_mid": {
            "label": "中度艺术激活",
            "prompt": (
                "当前学生对艺术化表达通道有中度激活。回答要把知识解释和审美/表达联系起来，"
                "可从画面、比喻、节奏、情绪、构图等角度选择1到2个进行引导。"
            ),
        },
        "art_deep": {
            "label": "深度艺术激活",
            "prompt": (
                "当前学生对艺术化表达通道有较强激活。回答优先使用具象、生动、可感知的表达；"
                "除结论外，再引导学生描述感受、比较表达效果，或完成一个小型创作任务。"
            ),
        },
        "art_deep_plus": {
            "label": "高强度艺术共创",
            "prompt": (
                "当前学生对艺术化表达通道高度激活。回答可以采用深度共创式引导，鼓励学生"
                "观察、命名、改写、创作和复盘，并把知识点转成具有画面感的学习活动。"
            ),
        },
    },
}

_CONFIG_CACHE: dict[str, Any] = {"mtime": None, "config": None}
_BRAIN_CACHE: dict[str, Any] = {"path": None, "mtime": None, "brain": None}


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


def _normalize_int(value: Any, fallback: int) -> int:
    if isinstance(value, int) and value > 0:
        return value
    return fallback


def _normalize_timestamp_ms(value: Any) -> int:
    try:
        timestamp = int(float(value))
    except Exception:
        return int(time.time() * 1000)

    if timestamp < 10_000_000_000:
        timestamp *= 1000
    return timestamp


def _count_words(text: str, words: list[str]) -> int:
    return sum(str(text).count(word) for word in words)


def _resolve_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = (OPEN_WEBUI_DIR / raw_path).resolve()
    else:
        path = path.resolve()
    return path


def _safe_user_id(user_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", user_id)


def load_personalization_brain_config() -> dict:
    config_path = PERSONALIZATION_BRAIN_CONFIG_PATH
    cached_config = _CONFIG_CACHE.get("config")

    if config_path.exists():
        mtime = config_path.stat().st_mtime
        if cached_config is not None and _CONFIG_CACHE.get("mtime") == mtime:
            return copy.deepcopy(cached_config)
    else:
        mtime = None
        if cached_config is not None and _CONFIG_CACHE.get("mtime") is None:
            return copy.deepcopy(cached_config)

    config = copy.deepcopy(DEFAULT_PERSONALIZATION_BRAIN_CONFIG)

    if config_path.exists():
        try:
            loaded = json.loads(config_path.read_text(encoding="utf-8"))
            if not isinstance(loaded, dict):
                raise ValueError("personalization brain config must be a JSON object")

            config["enabled"] = bool(loaded.get("enabled", config["enabled"]))

            metric_label = loaded.get("metric_label")
            if isinstance(metric_label, str) and metric_label.strip():
                config["metric_label"] = metric_label.strip()

            config["minimum_message_count"] = _normalize_int(
                loaded.get("minimum_message_count"),
                config["minimum_message_count"],
            )
            config["new_message_threshold"] = _normalize_int(
                loaded.get("new_message_threshold"),
                config["new_message_threshold"],
            )
            config["feature_message_limit"] = _normalize_int(
                loaded.get("feature_message_limit"),
                config["feature_message_limit"],
            )

            artifact_path = loaded.get("artifact_path")
            if isinstance(artifact_path, str) and artifact_path.strip():
                config["artifact_path"] = artifact_path.strip()

            runtime_export_dir = loaded.get("runtime_export_dir")
            if isinstance(runtime_export_dir, str) and runtime_export_dir.strip():
                config["runtime_export_dir"] = runtime_export_dir.strip()

            strategy_prompts = loaded.get("strategy_prompts")
            if isinstance(strategy_prompts, dict):
                normalized_prompts = copy.deepcopy(config["strategy_prompts"])
                for key, value in strategy_prompts.items():
                    if not isinstance(value, dict):
                        continue
                    prompt = value.get("prompt")
                    if not isinstance(prompt, str) or not prompt.strip():
                        continue
                    label = value.get("label")
                    normalized_prompts[key] = {
                        "label": label.strip()
                        if isinstance(label, str) and label.strip()
                        else normalized_prompts.get(key, {}).get("label", key),
                        "prompt": prompt.strip(),
                    }
                config["strategy_prompts"] = normalized_prompts
        except Exception as exc:
            log.warning(
                "Failed to load personalization brain config from %s, using defaults: %s",
                config_path,
                exc,
            )

    _CONFIG_CACHE["mtime"] = mtime
    _CONFIG_CACHE["config"] = copy.deepcopy(config)
    return config


def _get_brain(config: dict) -> Optional[XiaoLingPersonalizationBrain]:
    artifact_path = _resolve_path(config["artifact_path"])
    if not artifact_path.exists():
        log.warning("Personalization brain artifact not found: %s", artifact_path)
        return None

    mtime = artifact_path.stat().st_mtime
    if (
        _BRAIN_CACHE.get("brain") is not None
        and _BRAIN_CACHE.get("path") == str(artifact_path)
        and _BRAIN_CACHE.get("mtime") == mtime
    ):
        return _BRAIN_CACHE["brain"]

    try:
        brain = XiaoLingPersonalizationBrain(artifact_path)
    except Exception as exc:
        log.warning("Failed to load personalization brain artifact %s: %s", artifact_path, exc)
        return None

    _BRAIN_CACHE["path"] = str(artifact_path)
    _BRAIN_CACHE["mtime"] = mtime
    _BRAIN_CACHE["brain"] = brain
    return brain


def _get_learning_profile_settings(settings: Any) -> dict:
    settings_dict = _coerce_dict(settings)
    ui_settings = settings_dict.get("ui")
    if not isinstance(ui_settings, dict):
        return {}

    learning_profile = ui_settings.get("learning_profile")
    return learning_profile if isinstance(learning_profile, dict) else {}


def _build_settings_with_brain_profile(existing_settings: Any, brain_profile: dict) -> dict:
    settings = copy.deepcopy(_coerce_dict(existing_settings))
    ui_settings = settings.get("ui")
    if not isinstance(ui_settings, dict):
        ui_settings = {}

    learning_profile = ui_settings.get("learning_profile")
    if not isinstance(learning_profile, dict):
        learning_profile = {}

    learning_profile["brain_profile"] = brain_profile
    ui_settings["learning_profile"] = learning_profile
    settings["ui"] = ui_settings
    return settings


def _serialize_runtime_messages(messages: list[Any]) -> list[dict]:
    runtime_messages = []

    for message in messages:
        content_text = _extract_text_from_content(getattr(message, "content", None)).strip()
        usage = getattr(message, "usage", None)
        usage = usage if isinstance(usage, dict) else None

        runtime_messages.append(
            {
                "id": getattr(message, "id", ""),
                "chat_id": getattr(message, "chat_id", ""),
                "user_id": getattr(message, "user_id", ""),
                "role": getattr(message, "role", ""),
                "content": content_text,
                "model_id": getattr(message, "model_id", None),
                "usage": usage,
                "created_at": _normalize_timestamp_ms(getattr(message, "created_at", 0)),
                "updated_at": _normalize_timestamp_ms(getattr(message, "updated_at", 0)),
            }
        )

    runtime_messages.sort(key=lambda item: (item["created_at"], item["updated_at"], item["id"]))
    return runtime_messages


def _export_runtime_messages(user_id: str, runtime_messages: list[dict], config: dict) -> Path:
    export_dir = _resolve_path(config["runtime_export_dir"])
    export_dir.mkdir(parents=True, exist_ok=True)

    export_path = export_dir / f"{_safe_user_id(user_id)}_chat_messages.jsonl"
    temp_path = export_path.with_suffix(".jsonl.tmp")

    lines = [json.dumps(message, ensure_ascii=False) for message in runtime_messages]
    content = ("\n".join(lines) + "\n") if lines else ""
    temp_path.write_text(content, encoding="utf-8")
    temp_path.replace(export_path)

    return export_path


def _build_online_features(runtime_messages: list[dict], feature_message_limit: int) -> dict:
    feature_messages = runtime_messages[-feature_message_limit:] if feature_message_limit else runtime_messages

    user_messages = [message for message in feature_messages if message["role"] == "user"]
    assistant_messages = [
        message for message in feature_messages if message["role"] == "assistant"
    ]

    user_msg_count = len(user_messages)
    user_lengths = [len(message["content"]) for message in user_messages]
    art_kw_count = sum(_count_words(message["content"], ART_WORDS) for message in user_messages)
    confusion_kw_count = sum(
        _count_words(message["content"], CONFUSION_WORDS) for message in user_messages
    )

    first_user_ts = user_messages[0]["created_at"] if user_messages else 0
    last_user_ts = user_messages[-1]["created_at"] if user_messages else 0

    assistant_output_tokens = []
    for message in assistant_messages:
        usage = message.get("usage")
        output_tokens = 0
        if isinstance(usage, dict):
            try:
                output_tokens = float(usage.get("output_tokens", 0) or 0)
            except Exception:
                output_tokens = 0
        assistant_output_tokens.append(output_tokens)

    return {
        "user_msg_count": user_msg_count,
        "avg_user_msg_len": (
            float(sum(user_lengths) / user_msg_count) if user_msg_count else 0.0
        ),
        "art_kw_count": art_kw_count,
        "confusion_kw_count": confusion_kw_count,
        "assistant_msg_count": len(assistant_messages),
        "avg_output_tokens": (
            float(sum(assistant_output_tokens) / len(assistant_output_tokens))
            if assistant_output_tokens
            else 0.0
        ),
        "conversation_span_minutes": (
            max(last_user_ts - first_user_ts, 0) / 60000.0 if user_msg_count else 0.0
        ),
        "followup_depth_proxy": max(user_msg_count - 1, 0),
        "art_keyword_ratio": art_kw_count / max(user_msg_count, 1),
        "confusion_ratio": confusion_kw_count / max(user_msg_count, 1),
        "feature_message_count": len(feature_messages),
    }


def get_cached_personalization_brain_profile(settings: Any) -> Optional[dict]:
    learning_profile = _get_learning_profile_settings(settings)
    brain_profile = learning_profile.get("brain_profile")
    return brain_profile if isinstance(brain_profile, dict) else None


def refresh_personalization_brain_profile(
    user_or_id: Any,
    db: Optional[Session] = None,
    force: bool = False,
) -> Optional[dict]:
    config = load_personalization_brain_config()
    if not config.get("enabled", True):
        return None

    if isinstance(user_or_id, str):
        user_id = user_or_id
    else:
        user_id = getattr(user_or_id, "id", None) or _coerce_dict(user_or_id).get("id")

    if not user_id:
        return None

    user = Users.get_user_by_id(user_id, db=db)
    if not user:
        return None

    current_settings = getattr(user, "settings", None)
    current_profile = get_cached_personalization_brain_profile(current_settings) or {}

    raw_messages = ChatMessages.get_all_messages_by_user_id(user_id=user_id, db=db)
    runtime_messages = _serialize_runtime_messages(raw_messages)
    export_path = _export_runtime_messages(user_id, runtime_messages, config)

    total_message_count = len(runtime_messages)
    now = int(time.time())

    updated_profile = copy.deepcopy(current_profile)
    updated_profile.update(
        {
            "enabled": True,
            "metric_label": config["metric_label"],
            "minimum_message_count": config["minimum_message_count"],
            "new_message_threshold": config["new_message_threshold"],
            "feature_message_limit": config["feature_message_limit"],
            "runtime_messages_path": str(export_path),
            "total_message_count": total_message_count,
        }
    )

    last_synced_count = int(updated_profile.get("last_synced_message_count", -1) or -1)
    sync_changed = (
        last_synced_count != total_message_count
        or current_profile.get("runtime_messages_path") != str(export_path)
    )
    if sync_changed:
        updated_profile["last_synced_message_count"] = total_message_count
        updated_profile["last_synced_at"] = now

    last_evaluated_count = int(updated_profile.get("last_evaluated_message_count", 0) or 0)
    should_evaluate = (
        total_message_count >= config["minimum_message_count"]
        and (
            force
            or not updated_profile.get("strategy_id")
            or total_message_count - last_evaluated_count >= config["new_message_threshold"]
        )
    )

    features = None
    if should_evaluate:
        brain = _get_brain(config)
        if brain is not None:
            features = _build_online_features(
                runtime_messages=runtime_messages,
                feature_message_limit=config["feature_message_limit"],
            )
            feature_message_count = int(features.pop("feature_message_count", 0))
            if int(features["user_msg_count"]) > 0:
                try:
                    decision = brain.predict(features)
                    strategy_prompt = config["strategy_prompts"].get(decision.strategy_id, {})

                    updated_profile.update(
                        {
                            "score": round(float(decision.predicted_score), 4),
                            "strategy_id": decision.strategy_id,
                            "strategy_label": strategy_prompt.get("label", decision.strategy_id),
                            "path_name": decision.predicted_path_name,
                            "path_class": int(decision.predicted_path_class),
                            "path_confidence": round(float(decision.path_confidence), 4),
                            "intensity_bucket": decision.intensity_bucket,
                            "feature_message_count": feature_message_count,
                            "last_evaluated_message_count": total_message_count,
                            "last_evaluated_at": now,
                            "features": features,
                        }
                    )
                except Exception as exc:
                    log.warning(
                        "Failed to run personalization brain for user %s: %s",
                        user_id,
                        exc,
                    )

    if updated_profile != current_profile:
        updated_settings = _build_settings_with_brain_profile(
            current_settings,
            updated_profile,
        )
        Users.update_user_by_id(user_id, {"settings": updated_settings}, db=db)

    return updated_profile


def get_personalization_brain_system_prompt(
    user_or_id: Any,
    db: Optional[Session] = None,
) -> Optional[str]:
    profile = refresh_personalization_brain_profile(user_or_id, db=db)
    if not isinstance(profile, dict):
        return None

    strategy_id = profile.get("strategy_id")
    if not isinstance(strategy_id, str) or not strategy_id.strip():
        return None

    config = load_personalization_brain_config()
    strategy_prompt = config["strategy_prompts"].get(strategy_id)
    if not isinstance(strategy_prompt, dict):
        return None

    prompt = strategy_prompt.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        return None

    label = strategy_prompt.get("label") or strategy_id
    score = profile.get("score")
    score_text = ""
    if isinstance(score, (int, float)):
        score_text = f"当前{config['metric_label']}预测分数为 {float(score):.2f}。\n"

    return f"【个性化路由策略：{label}】\n{score_text}{prompt.strip()}".strip()
