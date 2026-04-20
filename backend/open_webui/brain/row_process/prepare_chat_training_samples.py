from __future__ import annotations

from pathlib import Path
import argparse
import pandas as pd

ART_WORDS = ["颜色", "画面", "感受", "想象", "描写", "观察", "氛围", "创作", "比喻", "生动"]
CONFUSION_WORDS = ["不明白", "看不懂", "抽象", "想象不出来", "不会写"]


def count_words(text: str, words: list[str]) -> int:
    text = str(text)
    return sum(text.count(w) for w in words)


def build_training_samples(chat_jsonl: str, label_csv: str, output_csv: str) -> str:
    chats = pd.read_json(chat_jsonl, lines=True, convert_dates=False)
    labels = pd.read_csv(label_csv)

    chats["created_at"] = pd.to_numeric(chats["created_at"], errors="coerce")
    chats["updated_at"] = pd.to_numeric(chats["updated_at"], errors="coerce")

    user_msgs = chats[chats["role"] == "user"].copy()
    asst_msgs = chats[chats["role"] == "assistant"].copy()

    user_msgs["msg_len"] = user_msgs["content"].astype(str).str.len()
    user_msgs["art_kw_count"] = user_msgs["content"].astype(str).apply(lambda x: count_words(x, ART_WORDS))
    user_msgs["confusion_kw_count"] = user_msgs["content"].astype(str).apply(lambda x: count_words(x, CONFUSION_WORDS))

    def get_output_tokens(v):
        if isinstance(v, dict):
            return v.get("output_tokens", 0)
        return 0

    asst_msgs["output_tokens"] = asst_msgs["usage"].apply(get_output_tokens)

    user_agg = user_msgs.groupby(["chat_id", "user_id"]).agg(
        user_msg_count=("id", "count"),
        avg_user_msg_len=("msg_len", "mean"),
        art_kw_count=("art_kw_count", "sum"),
        confusion_kw_count=("confusion_kw_count", "sum"),
        first_user_ts=("created_at", "min"),
        last_user_ts=("created_at", "max"),
    ).reset_index()

    asst_agg = asst_msgs.groupby(["chat_id", "user_id"]).agg(
        assistant_msg_count=("id", "count"),
        avg_output_tokens=("output_tokens", "mean"),
    ).reset_index()

    samples = labels.merge(user_agg, on=["chat_id", "user_id"], how="left")
    samples = samples.merge(asst_agg, on=["chat_id", "user_id"], how="left")

    samples["conversation_span_minutes"] = (samples["last_user_ts"] - samples["first_user_ts"]) / 60000.0
    samples["followup_depth_proxy"] = (samples["user_msg_count"] - 1).clip(lower=0)
    samples["art_keyword_ratio"] = samples["art_kw_count"] / samples["user_msg_count"].clip(lower=1)
    samples["confusion_ratio"] = samples["confusion_kw_count"] / samples["user_msg_count"].clip(lower=1)

    # 分类标签
    samples["activate_art_path"] = (samples["selected_path"] == "art").astype(int)

    ordered_columns = [
        "chat_id",
        "user_id",
        "selected_path",
        "decision_mode",
        "prompt_version",
        "art_affinity_score",
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
        "activate_art_path",
    ]
    ordered_columns = [c for c in ordered_columns if c in samples.columns]
    samples = samples[ordered_columns]

    Path(output_csv).parent.mkdir(parents=True, exist_ok=True)
    samples.to_csv(output_csv, index=False, encoding="utf-8-sig")
    return output_csv


def main():
    parser = argparse.ArgumentParser(description="将原始聊天日志处理为长河可训练的结构化样本表")
    parser.add_argument("--chat", required=True, help="原始聊天 JSONL 文件路径")
    parser.add_argument("--labels", required=True, help="路径标签 CSV 文件路径")
    parser.add_argument("--out", required=True, help="输出的训练样本 CSV 文件路径")
    args = parser.parse_args()

    output = build_training_samples(args.chat, args.labels, args.out)
    print(output)


if __name__ == "__main__":
    main()
