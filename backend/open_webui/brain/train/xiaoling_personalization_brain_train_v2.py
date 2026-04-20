# -*- coding: utf-8 -*-
"""
产品级串联版个性化大脑训练脚本
目标：
1. 基于同一份基础特征训练回归器（输出连续 personalization/art score）
2. 使用回归器的 OOF 预测分数作为新增特征，训练串联版分类器
3. 保存一个可直接在线推理的统一 brain artifact
4. 输出完整报告，便于部署、回溯、版本管理

训练结构：
base_features -> regressor (OOF score) -> classifier(base_features + pred_score)
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
import json
import math
import joblib
import numpy as np
import pandas as pd

from sklearn.base import clone
from sklearn.ensemble import (
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
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
from sklearn.model_selection import KFold, StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

RANDOM_STATE = 42
TEST_SIZE = 0.2
REG_CV_SPLITS = 5
CLS_CV_SPLITS = 5

REG_TARGET_COL = "art_affinity_score"
CLS_TARGET_COL = "activate_art_path"
STACKED_SCORE_COL = "pred_art_affinity_score"

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


def load_dataset(csv_path: str | Path):
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"找不到数据文件: {csv_path}")

    df = pd.read_csv(csv_path)

    required = BASE_FEATURE_COLS + [REG_TARGET_COL, CLS_TARGET_COL]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"数据缺少必要字段: {missing}")

    X = df[BASE_FEATURE_COLS].copy()
    y_reg = df[REG_TARGET_COL].copy()
    y_cls = df[CLS_TARGET_COL].copy()

    if X.isnull().any().any():
        X = X.fillna(X.median(numeric_only=True))

    return X, y_reg, y_cls


def build_regressor_candidates() -> dict[str, Pipeline]:
    return {
        "ridge": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("ridge", Ridge(alpha=1.0)),
            ]
        ),
        "random_forest": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                (
                    "random_forest",
                    RandomForestRegressor(
                        n_estimators=300,
                        criterion="squared_error",
                        max_depth=6,
                        min_samples_split=2,
                        min_samples_leaf=1,
                        max_features=None,
                        bootstrap=True,
                        n_jobs=-1,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
        "extra_trees": Pipeline(
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
        ),
        "gradient_boosting": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                (
                    "gradient_boosting",
                    GradientBoostingRegressor(
                        n_estimators=200,
                        learning_rate=0.05,
                        max_depth=3,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
    }


def build_classifier_candidates() -> dict[str, Pipeline]:
    stacked_cols = BASE_FEATURE_COLS + [STACKED_SCORE_COL]
    # Note: pipelines operate on DataFrame directly; StandardScaler works on numeric cols
    return {
        "logistic_regression": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                ("scaler", StandardScaler()),
                (
                    "logreg",
                    LogisticRegression(
                        max_iter=1000,
                        class_weight="balanced",
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
        "random_forest": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                (
                    "random_forest",
                    RandomForestClassifier(
                        n_estimators=300,
                        criterion="gini",
                        max_depth=6,
                        min_samples_split=2,
                        min_samples_leaf=1,
                        max_features="sqrt",
                        bootstrap=True,
                        class_weight="balanced",
                        n_jobs=-1,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
        "extra_trees": Pipeline(
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
        ),
        "gradient_boosting": Pipeline(
            steps=[
                ("variance_threshold", VarianceThreshold(threshold=0.0)),
                (
                    "gradient_boosting",
                    GradientBoostingClassifier(
                        n_estimators=200,
                        learning_rate=0.05,
                        max_depth=3,
                        random_state=RANDOM_STATE,
                    ),
                ),
            ]
        ),
    }


def evaluate_regressors_cv(X: pd.DataFrame, y: pd.Series, models: dict[str, Pipeline]) -> list[RegressorResult]:
    cv = KFold(n_splits=REG_CV_SPLITS, shuffle=True, random_state=RANDOM_STATE)
    scoring = {
        "r2": "r2",
        "neg_mae": "neg_mean_absolute_error",
        "neg_mse": "neg_mean_squared_error",
    }
    results: list[RegressorResult] = []

    for name, model in models.items():
        scores = cross_validate(model, X, y, cv=cv, scoring=scoring, n_jobs=1, return_train_score=False)
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


def generate_oof_and_fold_models(model: Pipeline, X: pd.DataFrame, y: pd.Series):
    cv = KFold(n_splits=REG_CV_SPLITS, shuffle=True, random_state=RANDOM_STATE)
    oof_pred = np.zeros(len(X), dtype=float)
    fold_models = []

    for train_idx, valid_idx in cv.split(X, y):
        fold_model = clone(model)
        fold_model.fit(X.iloc[train_idx], y.iloc[train_idx])
        oof_pred[valid_idx] = fold_model.predict(X.iloc[valid_idx])
        fold_models.append(fold_model)

    return oof_pred, fold_models


def ensemble_predict_regressor(fold_models: list[Pipeline], X: pd.DataFrame) -> np.ndarray:
    preds = np.column_stack([m.predict(X) for m in fold_models])
    return preds.mean(axis=1)


def evaluate_classifiers_cv(X_stacked: pd.DataFrame, y_cls: pd.Series, models: dict[str, Pipeline]) -> list[ClassifierResult]:
    cv = StratifiedKFold(n_splits=CLS_CV_SPLITS, shuffle=True, random_state=RANDOM_STATE)
    scoring = {
        "accuracy": "accuracy",
        "balanced_accuracy": "balanced_accuracy",
        "f1": "f1",
        "roc_auc": "roc_auc",
    }

    results: list[ClassifierResult] = []
    for name, model in models.items():
        scores = cross_validate(model, X_stacked, y_cls, cv=cv, scoring=scoring, n_jobs=1, return_train_score=False)
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


def main() -> None:
    BASE_DIR = Path(__file__).resolve().parents[1]
    data_path = BASE_DIR / "data" / "chat_training_samples.csv"
    X, y_reg, y_cls = load_dataset(data_path)

    # Outer holdout split: classification target stratified, product-like evaluation
    indices = np.arange(len(X))
    idx_train, idx_test = train_test_split(
        indices,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y_cls,
    )

    X_train, X_test = X.iloc[idx_train].reset_index(drop=True), X.iloc[idx_test].reset_index(drop=True)
    y_reg_train, y_reg_test = y_reg.iloc[idx_train].reset_index(drop=True), y_reg.iloc[idx_test].reset_index(drop=True)
    y_cls_train, y_cls_test = y_cls.iloc[idx_train].reset_index(drop=True), y_cls.iloc[idx_test].reset_index(drop=True)

    print("=== 基础特征列 ===")
    for col in BASE_FEATURE_COLS:
        print("-", col)

    # 1) Select best regressor on train split
    reg_candidates = build_regressor_candidates()
    reg_cv_results = evaluate_regressors_cv(X_train, y_reg_train, reg_candidates)
    best_reg_name = reg_cv_results[0].name
    best_reg_model_template = reg_candidates[best_reg_name]

    print("\n=== 回归器 5 折 CV（按 R2）===")
    for res in reg_cv_results:
        print(f"{res.name:>18} | cv_r2={res.mean_r2:.6f} | cv_mae={res.mean_mae:.6f} | cv_rmse={res.mean_rmse:.6f}")
    print(f"\n回归器最终选用: {best_reg_name}")

    # 2) Generate OOF reg scores for classifier train, and ensemble reg predictions for test
    train_reg_oof_score, reg_fold_models = generate_oof_and_fold_models(best_reg_model_template, X_train, y_reg_train)
    test_reg_pred_score = ensemble_predict_regressor(reg_fold_models, X_test)

    # Regressor holdout metrics
    reg_holdout_metrics = {
        "test_r2": r2_score(y_reg_test, test_reg_pred_score),
        "test_mae": mean_absolute_error(y_reg_test, test_reg_pred_score),
        "test_mse": mean_squared_error(y_reg_test, test_reg_pred_score),
        "test_rmse": math.sqrt(mean_squared_error(y_reg_test, test_reg_pred_score)),
        "test_explained_variance": explained_variance_score(y_reg_test, test_reg_pred_score),
    }

    # 3) Build stacked train/test data for classifier
    X_train_stacked = X_train.copy()
    X_train_stacked[STACKED_SCORE_COL] = train_reg_oof_score

    X_test_stacked = X_test.copy()
    X_test_stacked[STACKED_SCORE_COL] = test_reg_pred_score

    # 4) Select best classifier on stacked features
    cls_candidates = build_classifier_candidates()
    cls_cv_results = evaluate_classifiers_cv(X_train_stacked, y_cls_train, cls_candidates)
    best_cls_name = cls_cv_results[0].name
    best_cls_model = clone(cls_candidates[best_cls_name])

    print("\n=== 串联分类器 5 折 CV（按 F1）===")
    for res in cls_cv_results:
        print(
            f"{res.name:>20} | cv_f1={res.mean_f1:.6f} | "
            f"cv_acc={res.mean_accuracy:.6f} | cv_bal_acc={res.mean_balanced_accuracy:.6f} | cv_auc={res.mean_roc_auc:.6f}"
        )
    print(f"\n分类器最终选用: {best_cls_name}")

    best_cls_model.fit(X_train_stacked, y_cls_train)
    cls_test_pred = best_cls_model.predict(X_test_stacked)
    cls_test_proba = best_cls_model.predict_proba(X_test_stacked)[:, 1]

    cls_holdout_metrics = {
        "test_accuracy": accuracy_score(y_cls_test, cls_test_pred),
        "test_balanced_accuracy": balanced_accuracy_score(y_cls_test, cls_test_pred),
        "test_precision": precision_score(y_cls_test, cls_test_pred, zero_division=0),
        "test_recall": recall_score(y_cls_test, cls_test_pred, zero_division=0),
        "test_f1": f1_score(y_cls_test, cls_test_pred, zero_division=0),
        "test_roc_auc": roc_auc_score(y_cls_test, cls_test_proba),
    }

    # 5) Example route outputs on holdout for diagnostics
    route_preview = []
    for i in range(min(10, len(X_test_stacked))):
        path_class = int(cls_test_pred[i])
        path_proba = float(cls_test_proba[i] if path_class == 1 else 1 - cls_test_proba[i])
        score = float(test_reg_pred_score[i])
        strategy_id = route_strategy(path_class, path_proba, score, ROUTING_CONFIG)
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

    artifact = {
        "artifact_type": "xiaoling_personalization_brain",
        "version": "v2_stacked_product",
        "created_at_utc": utc_now_iso(),
        "base_feature_cols": BASE_FEATURE_COLS,
        "stacked_score_col": STACKED_SCORE_COL,
        "regressor_target_col": REG_TARGET_COL,
        "classifier_target_col": CLS_TARGET_COL,
        "label_meaning": LABEL_MEANING,
        "routing_config": ROUTING_CONFIG,
        "regressor_model_name": best_reg_name,
        "regressor_fold_models": reg_fold_models,
        "classifier_model_name": best_cls_name,
        "classifier_model": best_cls_model,
    }

    report = {
        "version": artifact["version"],
        "base_feature_cols": BASE_FEATURE_COLS,
        "stacked_score_col": STACKED_SCORE_COL,
        "regressor": {
            "model_name": best_reg_name,
            "cv_results": [asdict(r) for r in reg_cv_results],
            "holdout_metrics": reg_holdout_metrics,
        },
        "classifier": {
            "model_name": best_cls_name,
            "cv_results": [asdict(r) for r in cls_cv_results],
            "holdout_metrics": cls_holdout_metrics,
        },
        "routing_config": ROUTING_CONFIG,
        "route_preview": route_preview,
    }

    BASE_DIR = Path(__file__).resolve().parents[1]
    out_dir = BASE_DIR / "model"
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = out_dir / "xiaoling_personalization_brain_v2.joblib"
    report_path = out_dir / "xiaoling_personalization_brain_report_v2.json"

    joblib.dump(artifact, artifact_path)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n=== Hold-out 回归器指标 ===")
    for k, v in reg_holdout_metrics.items():
        print(f"{k}: {v:.6f}")

    print("\n=== Hold-out 分类器指标 ===")
    for k, v in cls_holdout_metrics.items():
        print(f"{k}: {v:.6f}")

    print(f"\n产品级串联 artifact 已保存到: {artifact_path}")
    print(f"产品级串联报告已保存到: {report_path}")


if __name__ == "__main__":
    main()
