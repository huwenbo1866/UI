# -*- coding: utf-8 -*-
"""
小玲个性化大脑 v2 串联推理路由器

用法：
1. 先用 xiaoling_personalization_brain_train_v2.py 训练并生成 artifact
2. 在在线服务中加载 artifact
3. 输入基础特征 dict，得到：
   - predicted_score
   - predicted_path_class
   - predicted_path_name
   - path_confidence
   - intensity_bucket
   - strategy_id

这个脚本面向部署和接入 OpenWebUI / 小玲后端。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import joblib
import numpy as np
import pandas as pd


@dataclass
class BrainDecision:
    predicted_score: float
    predicted_path_class: int
    predicted_path_name: str
    path_confidence: float
    intensity_bucket: str
    strategy_id: str


class XiaoLingPersonalizationBrain:
    def __init__(self, artifact_path: str | Path):
        artifact = joblib.load(artifact_path)
        self.base_feature_cols = artifact["base_feature_cols"]
        self.stacked_score_col = artifact["stacked_score_col"]
        self.label_meaning = artifact["label_meaning"]
        self.routing_config = artifact["routing_config"]
        self.regressor_fold_models = artifact["regressor_fold_models"]
        self.classifier_model = artifact["classifier_model"]

    def _prepare_base_df(self, features: dict[str, Any]) -> pd.DataFrame:
        missing = [c for c in self.base_feature_cols if c not in features]
        if missing:
            raise ValueError(f"缺少基础特征: {missing}")

        df = pd.DataFrame([features])[self.base_feature_cols].copy()
        return df

    def _predict_score(self, base_df: pd.DataFrame) -> float:
        preds = np.column_stack([m.predict(base_df) for m in self.regressor_fold_models])
        return float(preds.mean(axis=1)[0])

    def _bucketize_score(self, score: float) -> str:
        bins = self.routing_config["score_bins"]
        if score < bins[0]:
            return "low"
        if score < bins[1]:
            return "mid"
        if score < bins[2]:
            return "high"
        return "very_high"

    def _route_strategy(self, path_class: int, path_confidence: float, score: float) -> str:
        if path_confidence < self.routing_config["classifier_confidence_floor"]:
            return self.routing_config["strategies"]["fallback"]

        path_name = self.label_meaning[int(path_class)]
        bucket = self._bucketize_score(score)
        return self.routing_config["strategies"][path_name][bucket]

    def predict(self, features: dict[str, Any]) -> BrainDecision:
        base_df = self._prepare_base_df(features)
        score = self._predict_score(base_df)

        stacked_df = base_df.copy()
        stacked_df[self.stacked_score_col] = score

        proba = self.classifier_model.predict_proba(stacked_df)[0]
        path_class = int(np.argmax(proba))
        path_confidence = float(proba[path_class])
        path_name = self.label_meaning[path_class]
        bucket = self._bucketize_score(score)
        strategy_id = self._route_strategy(path_class, path_confidence, score)

        return BrainDecision(
            predicted_score=score,
            predicted_path_class=path_class,
            predicted_path_name=path_name,
            path_confidence=path_confidence,
            intensity_bucket=bucket,
            strategy_id=strategy_id,
        )


if __name__ == "__main__":
    BASE_DIR = Path(__file__).resolve().parents[1]
    artifact_path = BASE_DIR / "model" / "xiaoling_personalization_brain_v2.joblib"
    brain = XiaoLingPersonalizationBrain(artifact_path)

    example = {
        "user_msg_count": 8,
        "avg_user_msg_len": 42.5,
        "art_kw_count": 3,
        "confusion_kw_count": 1,
        "assistant_msg_count": 7,
        "avg_output_tokens": 180.0,
        "conversation_span_minutes": 12.0,
        "followup_depth_proxy": 2,
        "art_keyword_ratio": 0.18,
        "confusion_ratio": 0.05,
    }

    decision = brain.predict(example)
    print(decision)
