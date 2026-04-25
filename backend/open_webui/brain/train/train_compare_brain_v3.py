# -*- coding: utf-8 -*-
"""
离线训练与对比脚本（v3）。

目标：
1. 使用更稳健的评估方式（按 source_user_id 分组的 holdout + GroupKFold）
2. 在同一测试集上对比原模型结构 vs 优化模型结构
3. 优化模型适度引入模型结合（VotingRegressor / VotingClassifier）
4. 保存优化模型 artifact 与完整对比报告

说明：
- 不改动 v2 训练代码
- 本脚本输出独立的 v3 文件
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
import json
import math
import warnings

import joblib
import numpy as np
import pandas as pd

from sklearn.base import clone
from sklearn.ensemble import (
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
    VotingClassifier,
    VotingRegressor,
)
from sklearn.feature_selection import VarianceThreshold
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    explained_variance_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

try:
    from lightgbm import LGBMClassifier, LGBMRegressor

    HAS_LIGHTGBM = True
except Exception:
    HAS_LIGHTGBM = False

warnings.filterwarnings(
    "ignore",
    message=r"X does not have valid feature names, but LGBM(Regressor|Classifier) was fitted with feature names",
)

RANDOM_STATE = 42
TEST_SIZE = 0.2
GROUP_CV_SPLITS = 5

REG_TARGET_COL = "art_affinity_score"
CLS_TARGET_COL = "activate_art_path"
STACKED_SCORE_COL = "pred_art_affinity_score"
GROUP_COL = "source_user_id"

BASE_FEATURE_COLS = [
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
]

LABEL_MEANING = {
    0: "default_path",
    1: "activate_art_path",
}

ROUTING_CONFIG = {
    "score_bins": [0.35, 0.60, 0.80],
    "classifier_confidence_floor": 0.65,
    "strategies": {
        "default_path": {
            "low": "default_light",
            "mid": "default_guided",
            "high": "default_support",
            "very_high": "default_strong_support",
        },
        "activate_art_path": {
            "low": "art_light",
            "mid": "art_mid",
            "high": "art_deep",
            "very_high": "art_deep_plus",
        },
        "fallback": "default_guided",
    },
}


def compute_adaptive_score_bins(score_values: np.ndarray, fallback_bins: list[float]) -> list[float]:
    # Prefer quantile bins to adapt to score distribution shifts across retrains.
    if len(score_values) < 16:
        return fallback_bins

    q25, q50, q75 = np.quantile(score_values, [0.25, 0.50, 0.75])
    bins = [float(q25), float(q50), float(q75)]

    if not (bins[0] < bins[1] < bins[2]):
        return fallback_bins
    return bins


@dataclass
class RegressorResult:
    name: str
    mean_r2: float
    mean_mae: float
    mean_rmse: float


@dataclass
class ClassifierResult:
    name: str
    mean_f1: float
    mean_accuracy: float
    mean_balanced_accuracy: float
    mean_roc_auc: float


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_dataset(csv_path: str | Path) -> pd.DataFrame:
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"找不到数据文件: {csv_path}")

    df = pd.read_csv(csv_path)

    required = BASE_FEATURE_COLS + [REG_TARGET_COL, CLS_TARGET_COL, "user_id"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"数据缺少必要字段: {missing}")

    if GROUP_COL not in df.columns:
        df[GROUP_COL] = df["user_id"].astype(str)

    # 数值列转换与缺失填充
    for c in BASE_FEATURE_COLS + [REG_TARGET_COL, CLS_TARGET_COL]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    if df[BASE_FEATURE_COLS].isnull().any().any():
        df[BASE_FEATURE_COLS] = df[BASE_FEATURE_COLS].fillna(df[BASE_FEATURE_COLS].median(numeric_only=True))

    df = df.dropna(subset=[REG_TARGET_COL, CLS_TARGET_COL, GROUP_COL]).copy()
    df[CLS_TARGET_COL] = df[CLS_TARGET_COL].astype(int)
    df[GROUP_COL] = df[GROUP_COL].astype(str)

    return df.reset_index(drop=True)


def build_baseline_regressor() -> Pipeline:
    return Pipeline(
        steps=[
            ("variance_threshold", VarianceThreshold(threshold=0.0)),
            (
                "extra_trees",
                ExtraTreesRegressor(
                    n_estimators=300,
                    max_depth=6,
                    min_samples_split=2,
                    min_samples_leaf=1,
                    max_features=None,
                    n_jobs=-1,
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )


def build_baseline_classifier() -> Pipeline:
    return Pipeline(
        steps=[
            ("variance_threshold", VarianceThreshold(threshold=0.0)),
            (
                "extra_trees",
                ExtraTreesClassifier(
                    n_estimators=300,
                    criterion="gini",
                    max_depth=6,
                    min_samples_split=2,
                    min_samples_leaf=1,
                    max_features="sqrt",
                    class_weight="balanced",
                    n_jobs=-1,
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )


def build_regressor_candidates_optimized() -> dict[str, object]:
    et = ExtraTreesRegressor(
        n_estimators=320,
        max_depth=8,
        min_samples_leaf=1,
        min_samples_split=2,
        max_features=None,
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )
    gb = GradientBoostingRegressor(
        n_estimators=240,
        learning_rate=0.05,
        max_depth=3,
        random_state=RANDOM_STATE,
    )
    rf = RandomForestRegressor(
        n_estimators=320,
        max_depth=8,
        min_samples_leaf=1,
        min_samples_split=2,
        max_features=None,
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )

    candidates: dict[str, object] = {
        "ridge": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("ridge", Ridge(alpha=1.0)),
            ]
        ),
        "extra_trees": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("et", et),
            ]
        ),
        "random_forest": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("rf", rf),
            ]
        ),
        "gradient_boosting": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("gb", gb),
            ]
        ),
        "hist_gradient_boosting": HistGradientBoostingRegressor(
            max_depth=6,
            learning_rate=0.05,
            max_iter=320,
            random_state=RANDOM_STATE,
        ),
        "voting_et_gb_ridge": VotingRegressor(
            estimators=[
                ("et", et),
                ("gb", gb),
                ("ridge", Ridge(alpha=1.0)),
            ],
            weights=[0.50, 0.35, 0.15],
            n_jobs=-1,
        ),
    }

    if HAS_LIGHTGBM:
        lgbm_reg = LGBMRegressor(
            n_estimators=360,
            learning_rate=0.05,
            num_leaves=31,
            max_depth=-1,
            subsample=0.90,
            colsample_bytree=0.90,
            reg_alpha=0.05,
            reg_lambda=0.20,
            verbosity=-1,
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )
        candidates["lightgbm"] = Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("lgbm", lgbm_reg),
            ]
        )
        candidates["voting_et_lgbm_gb"] = VotingRegressor(
            estimators=[
                ("et", et),
                ("lgbm", lgbm_reg),
                ("gb", gb),
            ],
            weights=[0.40, 0.35, 0.25],
            n_jobs=-1,
        )

    return candidates


def build_classifier_candidates_optimized() -> dict[str, object]:
    et = ExtraTreesClassifier(
        n_estimators=320,
        criterion="gini",
        max_depth=8,
        min_samples_split=2,
        min_samples_leaf=1,
        max_features="sqrt",
        class_weight="balanced",
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )

    rf = RandomForestClassifier(
        n_estimators=320,
        criterion="gini",
        max_depth=8,
        min_samples_split=2,
        min_samples_leaf=1,
        max_features="sqrt",
        class_weight="balanced",
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )

    lr_pipe = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "logreg",
                LogisticRegression(
                    max_iter=1200,
                    class_weight="balanced",
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )

    candidates: dict[str, object] = {
        "extra_trees": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("et", et),
            ]
        ),
        "random_forest": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("rf", rf),
            ]
        ),
        "gradient_boosting": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                (
                    "gb",
                    GradientBoostingClassifier(
                        n_estimators=240,
                        learning_rate=0.05,
                        max_depth=3,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
        "hist_gradient_boosting": HistGradientBoostingClassifier(
            max_depth=6,
            learning_rate=0.05,
            max_iter=320,
            random_state=RANDOM_STATE,
        ),
        "logistic_regression": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("scaler", StandardScaler()),
                (
                    "logreg",
                    LogisticRegression(
                        max_iter=1200,
                        class_weight="balanced",
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
        "voting_et_lr": VotingClassifier(
            estimators=[
                ("et", et),
                ("lr", lr_pipe),
            ],
            voting="soft",
            weights=[0.65, 0.35],
            n_jobs=-1,
            flatten_transform=True,
        ),
    }

    if HAS_LIGHTGBM:
        lgbm_cls = LGBMClassifier(
            n_estimators=360,
            learning_rate=0.05,
            num_leaves=31,
            max_depth=-1,
            subsample=0.90,
            colsample_bytree=0.90,
            reg_alpha=0.05,
            reg_lambda=0.20,
            verbosity=-1,
            class_weight="balanced",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )
        candidates["lightgbm"] = Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("lgbm", lgbm_cls),
            ]
        )
        candidates["voting_et_lgbm_lr"] = VotingClassifier(
            estimators=[
                ("et", et),
                ("lgbm", lgbm_cls),
                ("lr", lr_pipe),
            ],
            voting="soft",
            weights=[0.45, 0.35, 0.20],
            n_jobs=-1,
            flatten_transform=True,
        )

    return candidates


def evaluate_regressors_group_cv(
    X: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
    models: dict[str, object],
) -> list[RegressorResult]:
    cv = GroupKFold(n_splits=GROUP_CV_SPLITS)
    scoring = {
        "r2": "r2",
        "neg_mae": "neg_mean_absolute_error",
        "neg_mse": "neg_mean_squared_error",
    }
    results: list[RegressorResult] = []

    for name, model in models.items():
        scores = cross_validate(
            model,
            X,
            y,
            groups=groups,
            cv=cv,
            scoring=scoring,
            n_jobs=1,
            return_train_score=False,
        )
        results.append(
            RegressorResult(
                name=name,
                mean_r2=float(scores["test_r2"].mean()),
                mean_mae=float((-scores["test_neg_mae"]).mean()),
                mean_rmse=math.sqrt(float((-scores["test_neg_mse"]).mean())),
            )
        )

    results.sort(key=lambda x: (x.mean_r2, -x.mean_rmse), reverse=True)
    return results


def generate_oof_and_fold_models_group(
    model_template: object,
    X: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
) -> tuple[np.ndarray, list[object]]:
    cv = GroupKFold(n_splits=GROUP_CV_SPLITS)
    oof_pred = np.zeros(len(X), dtype=float)
    fold_models = []

    for train_idx, valid_idx in cv.split(X, y, groups):
        fold_model = clone(model_template)
        fold_model.fit(X.iloc[train_idx], y.iloc[train_idx])
        oof_pred[valid_idx] = fold_model.predict(X.iloc[valid_idx])
        fold_models.append(fold_model)

    return oof_pred, fold_models


def ensemble_predict_regressor(fold_models: list[object], X: pd.DataFrame) -> np.ndarray:
    preds = np.column_stack([m.predict(X) for m in fold_models])
    return preds.mean(axis=1)


def evaluate_classifiers_group_cv(
    X_stacked: pd.DataFrame,
    y_cls: pd.Series,
    groups: pd.Series,
    models: dict[str, object],
) -> list[ClassifierResult]:
    cv = GroupKFold(n_splits=GROUP_CV_SPLITS)
    scoring = {
        "accuracy": "accuracy",
        "balanced_accuracy": "balanced_accuracy",
        "f1": "f1",
        "roc_auc": "roc_auc",
    }

    results: list[ClassifierResult] = []
    for name, model in models.items():
        scores = cross_validate(
            model,
            X_stacked,
            y_cls,
            groups=groups,
            cv=cv,
            scoring=scoring,
            n_jobs=1,
            return_train_score=False,
        )
        results.append(
            ClassifierResult(
                name=name,
                mean_f1=float(scores["test_f1"].mean()),
                mean_accuracy=float(scores["test_accuracy"].mean()),
                mean_balanced_accuracy=float(scores["test_balanced_accuracy"].mean()),
                mean_roc_auc=float(scores["test_roc_auc"].mean()),
            )
        )

    results.sort(key=lambda x: (x.mean_f1, x.mean_roc_auc), reverse=True)
    return results


def _select_best_threshold_by_f1(
    y_true: np.ndarray,
    pred_proba: np.ndarray,
    thresholds: np.ndarray,
) -> tuple[float, float, float]:
    best_threshold = 0.50
    best_f1 = -1.0
    best_bal_acc = -1.0

    for t in thresholds:
        pred = (pred_proba >= t).astype(int)
        f1 = f1_score(y_true, pred, zero_division=0)
        bal_acc = balanced_accuracy_score(y_true, pred)
        if (f1 > best_f1) or (f1 == best_f1 and bal_acc > best_bal_acc):
            best_f1 = f1
            best_bal_acc = bal_acc
            best_threshold = float(t)

    return best_threshold, float(best_f1), float(best_bal_acc)


def _build_group_oof_proba(
    model_template: object,
    X: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
) -> np.ndarray:
    cv = GroupKFold(n_splits=GROUP_CV_SPLITS)
    oof_proba = np.zeros(len(X), dtype=float)

    for train_idx, valid_idx in cv.split(X, y, groups):
        fold_model = clone(model_template)
        fold_model.fit(X.iloc[train_idx], y.iloc[train_idx])
        oof_proba[valid_idx] = fold_model.predict_proba(X.iloc[valid_idx])[:, 1]

    return oof_proba


def find_best_threshold_with_group_oof(
    model_template: object,
    X: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
) -> tuple[float, dict[str, float]]:
    oof_proba = _build_group_oof_proba(model_template, X, y, groups)

    thresholds = np.arange(0.30, 0.72, 0.02)
    y_true = y.to_numpy()
    best_threshold, best_f1, best_bal_acc = _select_best_threshold_by_f1(y_true, oof_proba, thresholds)

    return best_threshold, {
        "oof_best_f1": float(best_f1),
        "oof_best_balanced_accuracy": float(best_bal_acc),
    }


def find_scene_adaptive_thresholds_with_group_oof(
    model_template: object,
    X: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
    score_values: np.ndarray,
    score_bins: list[float],
    min_bucket_samples: int = 80,
    min_bucket_pos: int = 8,
    min_bucket_neg: int = 8,
) -> dict[str, object]:
    oof_proba = _build_group_oof_proba(model_template, X, y, groups)
    thresholds = np.arange(0.30, 0.72, 0.02)

    y_true = y.to_numpy()
    global_threshold, global_best_f1, global_best_bal_acc = _select_best_threshold_by_f1(
        y_true,
        oof_proba,
        thresholds,
    )

    bucket_names = ["low", "mid", "high", "very_high"]
    bucket_thresholds: dict[str, float] = {}
    bucket_stats: dict[str, dict[str, object]] = {}

    for bucket_name in bucket_names:
        mask = np.array(
            [bucketize_score(float(s), score_bins) == bucket_name for s in score_values],
            dtype=bool,
        )
        y_bucket = y_true[mask]
        p_bucket = oof_proba[mask]

        pos_cnt = int((y_bucket == 1).sum())
        neg_cnt = int((y_bucket == 0).sum())
        sample_cnt = int(mask.sum())
        can_tune = (
            sample_cnt >= min_bucket_samples
            and pos_cnt >= min_bucket_pos
            and neg_cnt >= min_bucket_neg
        )

        if can_tune:
            t_bucket, f1_bucket, bal_acc_bucket = _select_best_threshold_by_f1(
                y_bucket,
                p_bucket,
                thresholds,
            )
            bucket_thresholds[bucket_name] = float(t_bucket)
            bucket_stats[bucket_name] = {
                "samples": sample_cnt,
                "positive": pos_cnt,
                "negative": neg_cnt,
                "tuned": True,
                "oof_best_f1": float(f1_bucket),
                "oof_best_balanced_accuracy": float(bal_acc_bucket),
            }
        else:
            bucket_thresholds[bucket_name] = float(global_threshold)
            bucket_stats[bucket_name] = {
                "samples": sample_cnt,
                "positive": pos_cnt,
                "negative": neg_cnt,
                "tuned": False,
                "fallback_to_global": True,
            }

    threshold_info: dict[str, object] = {
        "mode": "scene_bucketed",
        "objective": "maximize_f1",
        "selected_threshold": float(global_threshold),
        "global_threshold": float(global_threshold),
        "global_oof_best_f1": float(global_best_f1),
        "global_oof_best_balanced_accuracy": float(global_best_bal_acc),
        "bucket_thresholds": bucket_thresholds,
        "bucket_stats": bucket_stats,
        "score_bins": score_bins,
    }

    bucket_pred = apply_scene_thresholds(
        oof_proba,
        score_values,
        threshold_info,
        score_bins,
    )
    threshold_info["bucketed_oof_f1"] = float(f1_score(y_true, bucket_pred, zero_division=0))
    threshold_info["bucketed_oof_balanced_accuracy"] = float(balanced_accuracy_score(y_true, bucket_pred))
    return threshold_info


def apply_scene_thresholds(
    pred_proba: np.ndarray,
    score_values: np.ndarray,
    threshold_info: dict[str, object],
    score_bins: list[float],
) -> np.ndarray:
    mode = str(threshold_info.get("mode", "global"))
    if mode != "scene_bucketed":
        t = float(threshold_info.get("selected_threshold", threshold_info.get("global_threshold", 0.5)))
        return (pred_proba >= t).astype(int)

    bucket_thresholds = threshold_info.get("bucket_thresholds", {})
    global_threshold = float(threshold_info.get("global_threshold", 0.5))

    preds = np.zeros(len(pred_proba), dtype=int)
    for i in range(len(pred_proba)):
        bucket_name = bucketize_score(float(score_values[i]), score_bins)
        t = float(bucket_thresholds.get(bucket_name, global_threshold))
        preds[i] = 1 if pred_proba[i] >= t else 0
    return preds


def bucketize_score(score: float, bins: list[float]) -> str:
    if score < bins[0]:
        return "low"
    if score < bins[1]:
        return "mid"
    if score < bins[2]:
        return "high"
    return "very_high"


def route_strategy(path_class: int, path_proba: float, score: float, config: dict) -> str:
    if path_proba < config["classifier_confidence_floor"]:
        return config["strategies"]["fallback"]

    label_name = LABEL_MEANING[int(path_class)]
    bucket = bucketize_score(float(score), config["score_bins"])
    return config["strategies"][label_name][bucket]


def train_and_eval_pipeline(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    reg_candidates: dict[str, object],
    cls_candidates: dict[str, object],
    mode_name: str,
    tune_threshold: bool = False,
    threshold_strategy: str = "global",
) -> dict:
    X_train = train_df[BASE_FEATURE_COLS].copy()
    y_reg_train = train_df[REG_TARGET_COL].copy()
    y_cls_train = train_df[CLS_TARGET_COL].copy()
    g_train = train_df[GROUP_COL].copy()

    X_test = test_df[BASE_FEATURE_COLS].copy()
    y_reg_test = test_df[REG_TARGET_COL].copy()
    y_cls_test = test_df[CLS_TARGET_COL].copy()

    reg_cv_results = evaluate_regressors_group_cv(X_train, y_reg_train, g_train, reg_candidates)
    best_reg_name = reg_cv_results[0].name
    best_reg_model_template = reg_candidates[best_reg_name]

    train_reg_oof_score, reg_fold_models = generate_oof_and_fold_models_group(
        best_reg_model_template,
        X_train,
        y_reg_train,
        g_train,
    )
    test_reg_pred_score = ensemble_predict_regressor(reg_fold_models, X_test)

    reg_holdout_metrics = {
        "test_r2": r2_score(y_reg_test, test_reg_pred_score),
        "test_mae": mean_absolute_error(y_reg_test, test_reg_pred_score),
        "test_mse": mean_squared_error(y_reg_test, test_reg_pred_score),
        "test_rmse": math.sqrt(mean_squared_error(y_reg_test, test_reg_pred_score)),
        "test_explained_variance": explained_variance_score(y_reg_test, test_reg_pred_score),
    }

    X_train_stacked = X_train.copy()
    X_train_stacked[STACKED_SCORE_COL] = train_reg_oof_score

    X_test_stacked = X_test.copy()
    X_test_stacked[STACKED_SCORE_COL] = test_reg_pred_score

    cls_cv_results = evaluate_classifiers_group_cv(X_train_stacked, y_cls_train, g_train, cls_candidates)
    best_cls_name = cls_cv_results[0].name
    best_cls_model = clone(cls_candidates[best_cls_name])

    best_cls_model.fit(X_train_stacked, y_cls_train)
    cls_test_proba = best_cls_model.predict_proba(X_test_stacked)[:, 1]

    threshold_info: dict[str, object] = {}
    runtime_score_bins = ROUTING_CONFIG["score_bins"]
    if tune_threshold:
        if threshold_strategy == "scene_bucketed":
            runtime_score_bins = compute_adaptive_score_bins(
                train_reg_oof_score,
                ROUTING_CONFIG["score_bins"],
            )
            threshold_info = find_scene_adaptive_thresholds_with_group_oof(
                best_cls_model,
                X_train_stacked,
                y_cls_train,
                g_train,
                train_reg_oof_score,
                runtime_score_bins,
            )
            cls_test_pred = apply_scene_thresholds(
                cls_test_proba,
                test_reg_pred_score,
                threshold_info,
                runtime_score_bins,
            )
        else:
            best_threshold, threshold_metrics = find_best_threshold_with_group_oof(
                best_cls_model,
                X_train_stacked,
                y_cls_train,
                g_train,
            )
            threshold_info = {
                "mode": "global",
                "objective": "maximize_f1",
                "selected_threshold": float(best_threshold),
                **threshold_metrics,
            }
            cls_test_pred = (cls_test_proba >= best_threshold).astype(int)
    else:
        cls_test_pred = best_cls_model.predict(X_test_stacked)
        threshold_info["mode"] = "fixed_default"
        threshold_info["selected_threshold"] = 0.5

    cls_holdout_metrics = {
        "test_accuracy": accuracy_score(y_cls_test, cls_test_pred),
        "test_balanced_accuracy": balanced_accuracy_score(y_cls_test, cls_test_pred),
        "test_precision": precision_score(y_cls_test, cls_test_pred, zero_division=0),
        "test_recall": recall_score(y_cls_test, cls_test_pred, zero_division=0),
        "test_f1": f1_score(y_cls_test, cls_test_pred, zero_division=0),
        "test_roc_auc": roc_auc_score(y_cls_test, cls_test_proba),
    }

    route_preview = []
    runtime_routing_config = dict(ROUTING_CONFIG)
    runtime_routing_config["score_bins"] = list(runtime_score_bins)
    for i in range(min(10, len(X_test_stacked))):
        path_class = int(cls_test_pred[i])
        path_proba = float(cls_test_proba[i] if path_class == 1 else 1 - cls_test_proba[i])
        score = float(test_reg_pred_score[i])
        strategy_id = route_strategy(path_class, path_proba, score, runtime_routing_config)
        route_preview.append(
            {
                "index": int(i),
                "predicted_score": score,
                "predicted_path_class": path_class,
                "predicted_path_name": LABEL_MEANING[path_class],
                "path_confidence": path_proba,
                "strategy_id": strategy_id,
            }
        )

    return {
        "mode": mode_name,
        "regressor_model_name": best_reg_name,
        "classifier_model_name": best_cls_name,
        "regressor_cv_results": [asdict(r) for r in reg_cv_results],
        "classifier_cv_results": [asdict(r) for r in cls_cv_results],
        "regressor_holdout_metrics": reg_holdout_metrics,
        "classifier_holdout_metrics": cls_holdout_metrics,
        "threshold_info": threshold_info,
        "regressor_fold_models": reg_fold_models,
        "classifier_model": best_cls_model,
        "route_preview": route_preview,
    }


def pick_source_group_col(df: pd.DataFrame) -> pd.Series:
    if GROUP_COL in df.columns:
        return df[GROUP_COL].astype(str)
    return df["user_id"].astype(str)


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    data_dir = base_dir / "data"
    model_dir = base_dir / "model"
    model_dir.mkdir(parents=True, exist_ok=True)

    original_path = data_dir / "chat_training_samples.csv"
    augmented_path = data_dir / "chat_training_samples_v3_augmented.csv"

    if not original_path.exists():
        raise FileNotFoundError(f"缺少原始训练集: {original_path}")
    if not augmented_path.exists():
        raise FileNotFoundError(
            f"缺少扩增训练集: {augmented_path}\n请先运行 build_augmented_dataset_v3.py"
        )

    original_df = load_dataset(original_path)
    augmented_df = load_dataset(augmented_path)

    # 基于原始数据做严格分组 holdout；该测试集用于 baseline 与 optimized 的公平对比
    gss = GroupShuffleSplit(n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE)
    groups_origin = pick_source_group_col(original_df)

    idx_train, idx_test = next(gss.split(original_df, original_df[CLS_TARGET_COL], groups=groups_origin))
    origin_train_df = original_df.iloc[idx_train].reset_index(drop=True)
    origin_test_df = original_df.iloc[idx_test].reset_index(drop=True)

    test_group_set = set(origin_test_df[GROUP_COL].astype(str).unique())
    aug_train_df = augmented_df[~augmented_df[GROUP_COL].astype(str).isin(test_group_set)].reset_index(drop=True)

    # baseline: 原模型结构，原始训练集
    baseline_reg_candidates = {"baseline_extra_trees": build_baseline_regressor()}
    baseline_cls_candidates = {"baseline_extra_trees": build_baseline_classifier()}

    baseline_result = train_and_eval_pipeline(
        train_df=origin_train_df,
        test_df=origin_test_df,
        reg_candidates=baseline_reg_candidates,
        cls_candidates=baseline_cls_candidates,
        mode_name="baseline_v2_architecture",
        tune_threshold=False,
    )

    # optimized: 扩增训练集 + 组合候选
    opt_reg_candidates = build_regressor_candidates_optimized()
    opt_cls_candidates = build_classifier_candidates_optimized()

    optimized_result = train_and_eval_pipeline(
        train_df=aug_train_df,
        test_df=origin_test_df,
        reg_candidates=opt_reg_candidates,
        cls_candidates=opt_cls_candidates,
        mode_name="optimized_v3_group_eval",
        tune_threshold=True,
        threshold_strategy="scene_bucketed",
    )

    # 产出优化 artifact（供离线或后续接入使用）
    artifact = {
        "artifact_type": "xiaoling_personalization_brain",
        "version": "v3_optimized_group_eval",
        "created_at_utc": utc_now_iso(),
        "base_feature_cols": BASE_FEATURE_COLS,
        "stacked_score_col": STACKED_SCORE_COL,
        "regressor_target_col": REG_TARGET_COL,
        "classifier_target_col": CLS_TARGET_COL,
        "group_col": GROUP_COL,
        "label_meaning": LABEL_MEANING,
        "routing_config": ROUTING_CONFIG,
        "regressor_model_name": optimized_result["regressor_model_name"],
        "regressor_fold_models": optimized_result["regressor_fold_models"],
        "classifier_model_name": optimized_result["classifier_model_name"],
        "classifier_model": optimized_result["classifier_model"],
    }

    artifact_path = model_dir / "xiaoling_personalization_brain_v3_optimized.joblib"
    joblib.dump(artifact, artifact_path)

    # 对比报告
    def _delta(new: float, old: float) -> float:
        return float(new - old)

    baseline_reg = baseline_result["regressor_holdout_metrics"]
    baseline_cls = baseline_result["classifier_holdout_metrics"]
    optimized_reg = optimized_result["regressor_holdout_metrics"]
    optimized_cls = optimized_result["classifier_holdout_metrics"]

    comparison = {
        "evaluation": {
            "strategy": "Group-aware holdout + GroupKFold CV",
            "group_col": GROUP_COL,
            "test_size": TEST_SIZE,
            "cv_splits": GROUP_CV_SPLITS,
            "random_state": RANDOM_STATE,
            "primary_objective": "f1",
            "lightgbm_enabled": HAS_LIGHTGBM,
            "note": "baseline与optimized使用同一原始测试集，optimized仅用训练组来源的数据做扩增训练",
        },
        "data": {
            "original_rows": int(len(original_df)),
            "augmented_rows": int(len(augmented_df)),
            "origin_train_rows": int(len(origin_train_df)),
            "origin_test_rows": int(len(origin_test_df)),
            "optimized_train_rows": int(len(aug_train_df)),
            "test_unique_groups": int(len(test_group_set)),
        },
        "baseline": {
            "mode": baseline_result["mode"],
            "regressor_model": baseline_result["regressor_model_name"],
            "classifier_model": baseline_result["classifier_model_name"],
            "threshold_info": baseline_result["threshold_info"],
            "regressor_cv": baseline_result["regressor_cv_results"],
            "classifier_cv": baseline_result["classifier_cv_results"],
            "regressor_holdout": baseline_reg,
            "classifier_holdout": baseline_cls,
        },
        "optimized": {
            "mode": optimized_result["mode"],
            "regressor_model": optimized_result["regressor_model_name"],
            "classifier_model": optimized_result["classifier_model_name"],
            "threshold_info": optimized_result["threshold_info"],
            "regressor_cv": optimized_result["regressor_cv_results"],
            "classifier_cv": optimized_result["classifier_cv_results"],
            "regressor_holdout": optimized_reg,
            "classifier_holdout": optimized_cls,
            "route_preview": optimized_result["route_preview"],
        },
        "delta_optimized_minus_baseline": {
            "reg_test_r2": _delta(optimized_reg["test_r2"], baseline_reg["test_r2"]),
            "reg_test_rmse": _delta(optimized_reg["test_rmse"], baseline_reg["test_rmse"]),
            "cls_test_f1": _delta(optimized_cls["test_f1"], baseline_cls["test_f1"]),
            "cls_test_accuracy": _delta(optimized_cls["test_accuracy"], baseline_cls["test_accuracy"]),
            "cls_test_roc_auc": _delta(optimized_cls["test_roc_auc"], baseline_cls["test_roc_auc"]),
        },
    }

    report_path = model_dir / "xiaoling_personalization_brain_v3_comparison_report.json"
    report_path.write_text(json.dumps(comparison, ensure_ascii=False, indent=2), encoding="utf-8")

    summary_md_path = model_dir / "xiaoling_personalization_brain_v3_comparison_summary.md"
    summary_md = "\n".join(
        [
            "# v3 模型离线对比总结",
            "",
            f"- 评估策略: {comparison['evaluation']['strategy']}",
            f"- 分组字段: {GROUP_COL}",
            f"- 原始训练集行数: {comparison['data']['original_rows']}",
            f"- 扩增训练集行数: {comparison['data']['augmented_rows']}",
            f"- 公平测试集行数: {comparison['data']['origin_test_rows']}",
            "",
            "## Baseline (v2结构)",
            f"- Regressor: {baseline_result['regressor_model_name']}",
            f"- Classifier: {baseline_result['classifier_model_name']}",
            f"- test_r2: {baseline_reg['test_r2']:.6f}",
            f"- test_rmse: {baseline_reg['test_rmse']:.6f}",
            f"- test_f1: {baseline_cls['test_f1']:.6f}",
            f"- test_accuracy: {baseline_cls['test_accuracy']:.6f}",
            f"- test_roc_auc: {baseline_cls['test_roc_auc']:.6f}",
            "",
            "## Optimized (v3)",
            f"- Regressor: {optimized_result['regressor_model_name']}",
            f"- Classifier: {optimized_result['classifier_model_name']}",
            f"- Threshold strategy: {optimized_result['threshold_info'].get('mode', 'global')}",
            f"- test_r2: {optimized_reg['test_r2']:.6f}",
            f"- test_rmse: {optimized_reg['test_rmse']:.6f}",
            f"- test_f1: {optimized_cls['test_f1']:.6f}",
            f"- test_accuracy: {optimized_cls['test_accuracy']:.6f}",
            f"- test_roc_auc: {optimized_cls['test_roc_auc']:.6f}",
            "",
            "## Delta (optimized - baseline)",
            f"- reg_test_r2: {comparison['delta_optimized_minus_baseline']['reg_test_r2']:.6f}",
            f"- reg_test_rmse: {comparison['delta_optimized_minus_baseline']['reg_test_rmse']:.6f}",
            f"- cls_test_f1: {comparison['delta_optimized_minus_baseline']['cls_test_f1']:.6f}",
            f"- cls_test_accuracy: {comparison['delta_optimized_minus_baseline']['cls_test_accuracy']:.6f}",
            f"- cls_test_roc_auc: {comparison['delta_optimized_minus_baseline']['cls_test_roc_auc']:.6f}",
        ]
    )
    summary_md_path.write_text(summary_md, encoding="utf-8")

    print("=== v3 训练与对比完成 ===")
    print(f"优化模型artifact: {artifact_path}")
    print(f"对比报告JSON: {report_path}")
    print(f"对比报告Markdown: {summary_md_path}")

    print("\n=== Baseline Holdout ===")
    for k, v in baseline_reg.items():
        print(f"reg_{k}: {v:.6f}")
    for k, v in baseline_cls.items():
        print(f"cls_{k}: {v:.6f}")

    print("\n=== Optimized Holdout ===")
    for k, v in optimized_reg.items():
        print(f"reg_{k}: {v:.6f}")
    for k, v in optimized_cls.items():
        print(f"cls_{k}: {v:.6f}")


if __name__ == "__main__":
    main()
