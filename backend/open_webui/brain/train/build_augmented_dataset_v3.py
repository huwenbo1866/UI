# -*- coding: utf-8 -*-
"""
构建高质量扩增训练集（v3）。

目标：
1. 清洗并校验原始训练样本质量
2. 在不破坏字段语义的前提下做受控扩增
3. 输出 class-balance 更好的数据集，降低过拟合风险

输出：
- backend/open_webui/brain/data/chat_training_samples_v3_augmented.csv
- backend/open_webui/brain/data/chat_training_samples_v3_augmented_quality_report.json
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import json

import numpy as np
import pandas as pd

RANDOM_STATE = 42
TARGET_PER_CLASS = 550

REG_TARGET_COL = "art_affinity_score"
CLS_TARGET_COL = "activate_art_path"

NUMERIC_COLS = [
    "user_msg_count",
    "avg_user_msg_len",
    "art_kw_count",
    "confusion_kw_count",
    "assistant_msg_count",
    "avg_output_tokens",
    "conversation_span_minutes",
    "followup_depth_proxy",
    "art_keyword_ratio",
    "confusion_ratio",
    REG_TARGET_COL,
    CLS_TARGET_COL,
]

REQUIRED_COLS = [
    "id",
    "chat_id",
    "user_id",
    "selected_path",
    "decision_mode",
    "prompt_version",
    REG_TARGET_COL,
    "created_at",
    "user_msg_count",
    "avg_user_msg_len",
    "art_kw_count",
    "confusion_kw_count",
    "assistant_msg_count",
    "avg_output_tokens",
    "conversation_span_minutes",
    "followup_depth_proxy",
    "art_keyword_ratio",
    "confusion_ratio",
    CLS_TARGET_COL,
]


@dataclass
class QualityStats:
    rows: int
    unique_users: int
    class_0_count: int
    class_1_count: int
    missing_cells: int
    duplicate_ids: int
    score_out_of_range: int
    inconsistent_label_pairs: int


def _safe_float(v: object, default: float = 0.0) -> float:
    try:
        if pd.isna(v):
            return default
        return float(v)
    except Exception:
        return default


def _safe_int(v: object, default: int = 0) -> int:
    try:
        if pd.isna(v):
            return default
        return int(round(float(v)))
    except Exception:
        return default


def sanitize_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    missing_cols = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing_cols:
        raise ValueError(f"输入数据缺少列: {missing_cols}")

    for col in NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # 删除关键字段缺失行
    key_required = [
        "id",
        "chat_id",
        "user_id",
        "selected_path",
        REG_TARGET_COL,
        CLS_TARGET_COL,
        "user_msg_count",
        "assistant_msg_count",
    ]
    df = df.dropna(subset=key_required).copy()

    # 整数列
    for col in ["user_msg_count", "art_kw_count", "confusion_kw_count", "assistant_msg_count", "followup_depth_proxy", CLS_TARGET_COL]:
        df[col] = df[col].apply(_safe_int)

    # 浮点列
    for col in [
        "avg_user_msg_len",
        "avg_output_tokens",
        "conversation_span_minutes",
        "art_keyword_ratio",
        "confusion_ratio",
        REG_TARGET_COL,
    ]:
        df[col] = df[col].apply(_safe_float)

    # 合理范围裁剪
    df["user_msg_count"] = df["user_msg_count"].clip(lower=2, upper=12)
    df["assistant_msg_count"] = df["assistant_msg_count"].clip(lower=1, upper=12)
    df["art_kw_count"] = df["art_kw_count"].clip(lower=0, upper=20)
    df["confusion_kw_count"] = df["confusion_kw_count"].clip(lower=0, upper=10)
    df["avg_user_msg_len"] = df["avg_user_msg_len"].clip(lower=12.0, upper=160.0)
    df["avg_output_tokens"] = df["avg_output_tokens"].clip(lower=40.0, upper=600.0)
    df["conversation_span_minutes"] = df["conversation_span_minutes"].clip(lower=0.5, upper=120.0)
    df[REG_TARGET_COL] = df[REG_TARGET_COL].clip(lower=0.0, upper=1.0)
    df[CLS_TARGET_COL] = df[CLS_TARGET_COL].clip(lower=0, upper=1)

    # 派生特征重算，保证一致性
    df["followup_depth_proxy"] = (df["user_msg_count"] - 1).clip(lower=0)
    denom = df["user_msg_count"].replace(0, 1)
    df["art_keyword_ratio"] = df["art_kw_count"] / denom
    df["confusion_ratio"] = df["confusion_kw_count"] / denom

    # 标签对齐
    df["selected_path"] = np.where(df[CLS_TARGET_COL] == 1, "art", "default")

    # 去重
    df = df.drop_duplicates(subset=["id"], keep="first").reset_index(drop=True)

    return df


def quality_stats(df: pd.DataFrame) -> QualityStats:
    class_counts = df[CLS_TARGET_COL].value_counts().to_dict()
    missing_cells = int(df.isna().sum().sum())
    duplicate_ids = int(df.duplicated(subset=["id"]).sum())
    score_out_of_range = int(((df[REG_TARGET_COL] < 0) | (df[REG_TARGET_COL] > 1)).sum())
    inconsistent = int(
        (
            ((df["selected_path"] == "art") & (df[CLS_TARGET_COL] != 1))
            | ((df["selected_path"] != "art") & (df[CLS_TARGET_COL] != 0))
        ).sum()
    )

    return QualityStats(
        rows=int(len(df)),
        unique_users=int(df["user_id"].nunique()),
        class_0_count=int(class_counts.get(0, 0)),
        class_1_count=int(class_counts.get(1, 0)),
        missing_cells=missing_cells,
        duplicate_ids=duplicate_ids,
        score_out_of_range=score_out_of_range,
        inconsistent_label_pairs=inconsistent,
    )


def _build_synthetic_row(source: pd.Series, class_label: int, idx: int, rng: np.random.Generator, score_bounds: tuple[float, float]) -> dict:
    src_user_cnt = max(2, _safe_int(source["user_msg_count"], 4))
    user_msg_count = int(np.clip(src_user_cnt + rng.integers(-1, 2), 2, 10))

    # 绝大多数情况下 assistant 消息数与 user 消息数相近，减少不自然模式
    if rng.random() < 0.85:
        assistant_msg_count = user_msg_count
    else:
        assistant_msg_count = int(np.clip(user_msg_count + rng.integers(-1, 2), 1, 10))

    avg_user_msg_len = float(np.clip(_safe_float(source["avg_user_msg_len"], 40.0) * rng.normal(1.0, 0.08), 12.0, 120.0))
    avg_output_tokens = float(np.clip(_safe_float(source["avg_output_tokens"], 170.0) * rng.normal(1.0, 0.10), 50.0, 420.0))
    conversation_span_minutes = float(np.clip(_safe_float(source["conversation_span_minutes"], 9.0) * rng.normal(1.0, 0.15), 1.0, 70.0))

    art_density = max(0.0, _safe_float(source["art_keyword_ratio"], 0.4))
    conf_density = max(0.0, _safe_float(source["confusion_ratio"], 0.1))

    art_kw_count = int(np.clip(rng.poisson(lam=max(0.02, art_density * user_msg_count)), 0, 20))
    confusion_kw_count = int(np.clip(rng.poisson(lam=max(0.01, conf_density * user_msg_count)), 0, 10))

    # 派生字段保持一致
    followup_depth_proxy = max(user_msg_count - 1, 0)
    art_keyword_ratio = art_kw_count / max(user_msg_count, 1)
    confusion_ratio = confusion_kw_count / max(user_msg_count, 1)

    # 连续分数：保留来源分数，同时让特征对分数产生可解释影响
    src_score = _safe_float(source[REG_TARGET_COL], 0.45)
    class_anchor = 0.72 if class_label == 1 else 0.30
    feature_score = (
        0.60 * art_keyword_ratio
        - 0.30 * confusion_ratio
        + 0.10 * min(avg_user_msg_len / 60.0, 1.0)
        + 0.10 * min(avg_output_tokens / 260.0, 1.0)
    )

    raw_score = 0.50 * src_score + 0.30 * class_anchor + 0.20 * feature_score + rng.normal(0.0, 0.03)
    low, high = score_bounds
    art_affinity_score = float(np.clip(raw_score, low, high))

    prompt_version = "art_v3" if class_label == 1 else "default_v3"
    selected_path = "art" if class_label == 1 else "default"

    synthetic_user_id = f"aug_user_{class_label}_{idx // 4:04d}"

    return {
        "id": f"aug_v3_{idx:06d}",
        "chat_id": f"aug_chat_{idx:06d}",
        "user_id": synthetic_user_id,
        "source_user_id": str(source["user_id"]),
        "is_synthetic": 1,
        "selected_path": selected_path,
        "decision_mode": "synthetic_aug_v3",
        "prompt_version": prompt_version,
        REG_TARGET_COL: art_affinity_score,
        "created_at": _safe_int(source.get("created_at", 0), 0),
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
        CLS_TARGET_COL: class_label,
    }


def generate_augmented(df: pd.DataFrame, target_per_class: int = TARGET_PER_CLASS) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_STATE)
    base = df.copy()

    base["source_user_id"] = base["user_id"].astype(str)
    base["is_synthetic"] = 0

    class_counts = base[CLS_TARGET_COL].value_counts().to_dict()
    synthetic_rows: list[dict] = []

    next_idx = 1
    for class_label in [0, 1]:
        current_count = int(class_counts.get(class_label, 0))
        need = max(0, target_per_class - current_count)
        if need == 0:
            continue

        pool = base[base[CLS_TARGET_COL] == class_label].reset_index(drop=True)
        if pool.empty:
            continue

        q05 = float(pool[REG_TARGET_COL].quantile(0.05))
        q95 = float(pool[REG_TARGET_COL].quantile(0.95))
        score_bounds = (max(0.0, q05 - 0.04), min(1.0, q95 + 0.04))

        for _ in range(need):
            src = pool.iloc[int(rng.integers(0, len(pool)))]
            synthetic_rows.append(_build_synthetic_row(src, class_label, next_idx, rng, score_bounds))
            next_idx += 1

    syn_df = pd.DataFrame(synthetic_rows)

    if not syn_df.empty:
        # 统一列顺序
        ordered = list(base.columns)
        for c in syn_df.columns:
            if c not in ordered:
                ordered.append(c)
        base = base.reindex(columns=ordered)
        syn_df = syn_df.reindex(columns=ordered)
        merged = pd.concat([base, syn_df], ignore_index=True)
    else:
        merged = base

    # 再次清洗，确保一致性
    merged = sanitize_df(merged)

    if "source_user_id" not in merged.columns:
        merged["source_user_id"] = merged["user_id"].astype(str)
    if "is_synthetic" not in merged.columns:
        merged["is_synthetic"] = 0

    # 对扩增字段进行缺省填充
    merged["source_user_id"] = merged["source_user_id"].fillna(merged["user_id"].astype(str))
    merged["is_synthetic"] = pd.to_numeric(merged["is_synthetic"], errors="coerce").fillna(0).astype(int)

    return merged


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    in_path = base_dir / "data" / "chat_training_samples.csv"
    out_path = base_dir / "data" / "chat_training_samples_v3_augmented.csv"
    report_path = base_dir / "data" / "chat_training_samples_v3_augmented_quality_report.json"

    if not in_path.exists():
        raise FileNotFoundError(f"未找到输入数据: {in_path}")

    raw = pd.read_csv(in_path)
    clean = sanitize_df(raw)
    augmented = generate_augmented(clean, target_per_class=TARGET_PER_CLASS)

    pre_stats = quality_stats(clean)
    post_stats = quality_stats(augmented)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    augmented.to_csv(out_path, index=False, encoding="utf-8-sig")

    report = {
        "version": "v3_augmented",
        "random_state": RANDOM_STATE,
        "target_per_class": TARGET_PER_CLASS,
        "input_file": str(in_path),
        "output_file": str(out_path),
        "pre_stats": asdict(pre_stats),
        "post_stats": asdict(post_stats),
        "added_rows": int(len(augmented) - len(clean)),
        "synthetic_rows": int((augmented["is_synthetic"] == 1).sum()),
        "real_rows": int((augmented["is_synthetic"] == 0).sum()),
    }

    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== v3 数据扩增完成 ===")
    print(f"输入: {in_path}")
    print(f"输出: {out_path}")
    print(f"质量报告: {report_path}")
    print(f"原始行数: {len(clean)}")
    print(f"扩增后行数: {len(augmented)}")
    print(f"新增行数: {len(augmented) - len(clean)}")
    print(
        "扩增后标签分布: "
        f"class0={(augmented[CLS_TARGET_COL] == 0).sum()}, "
        f"class1={(augmented[CLS_TARGET_COL] == 1).sum()}"
    )


if __name__ == "__main__":
    main()
