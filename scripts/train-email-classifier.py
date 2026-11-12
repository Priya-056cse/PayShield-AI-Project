#!/usr/bin/env python
"""Reproducible, duplicate-safe phishing detector benchmark and model export."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB

ROOT = Path(__file__).resolve().parents[1]
DATASET = Path(os.environ.get(
    "PAYSHIELD_EMAIL_DATASET",
    Path(os.environ.get("TEMP", "/tmp")) / "payshield-phishing-email-dataset.csv",
))
MODEL_PATH = ROOT / "models" / "phishing-email-model.v1.json"
REPORT_PATH = ROOT / "reports" / "phishing-email-ml-comparison.md"
RANDOM_STATE = 42
DATASET_REVISION = "34085a032c123ca237f314a01a67909cdea35e34"
EXPECTED_ROWS = 18650
TOKEN_PATTERN = r"(?u)\b\w\w+\b"
TOKEN_RE = re.compile(TOKEN_PATTERN)


def clean_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = "".join(
        " " if ord(char) == 0 or unicodedata.category(char) == "Cc" else char
        for char in text
    )
    return " ".join(text.split()).strip()


def load_dataset() -> tuple[list[str], np.ndarray, dict[str, int]]:
    if not DATASET.is_file():
        raise FileNotFoundError(
            f"Dataset CSV not found at {DATASET}; run the public dataset evaluation/import first."
        )

    csv.field_size_limit(100_000_000)
    grouped: dict[str, list[tuple[str, int]]] = defaultdict(list)
    csv_rows = 0
    empty_rows = 0
    unknown_labels = 0
    with DATASET.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or not {"Email Text", "Email Type"}.issubset(reader.fieldnames):
            raise ValueError(f"Expected Email Text and Email Type columns, found {reader.fieldnames}.")
        for row in reader:
            csv_rows += 1
            text = clean_text(row.get("Email Text") or "")
            label = (row.get("Email Type") or "").strip().casefold()
            if not text:
                empty_rows += 1
                continue
            if label == "phishing email":
                target = 1
            elif label == "safe email":
                target = 0
            else:
                unknown_labels += 1
                continue
            grouped[text.casefold()].append((text, target))

    if csv_rows != EXPECTED_ROWS:
        raise ValueError(f"Expected {EXPECTED_ROWS} dataset rows, found {csv_rows}; refusing partial data.")

    duplicates_removed = sum(len(rows) - 1 for rows in grouped.values())
    conflicting = [key for key, rows in grouped.items() if len({label for _, label in rows}) > 1]
    for key in conflicting:
        del grouped[key]
    records = [rows[0] for rows in grouped.values()]
    texts = [text[:12000] for text, _ in records]
    labels = np.asarray([label for _, label in records], dtype=np.int8)

    counts = {
        "source_rows": csv_rows,
        "empty_rows": empty_rows,
        "unknown_label_rows": unknown_labels,
        "duplicate_rows_removed": duplicates_removed,
        "conflicting_duplicate_groups_removed": len(conflicting),
        "unique_rows": len(records),
        "safe_rows": int(np.sum(labels == 0)),
        "phishing_rows": int(np.sum(labels == 1)),
    }
    if len(set(labels.tolist())) != 2:
        raise ValueError("Both Safe and Phishing labels are required.")
    return texts, labels, counts


def score_existing_rules(texts: list[str]) -> list[dict[str, object]]:
    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "score-email-rules.mjs")],
        cwd=ROOT,
        input=json.dumps(texts, ensure_ascii=False),
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )
    scores = json.loads(result.stdout)
    if len(scores) != len(texts):
        raise RuntimeError("Rule scorer returned a different number of rows than requested.")
    return scores


def binary_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, object]:
    tn, fp, fn, tp = (int(value) for value in confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "accuracy": (tp + tn) / len(y_true) if len(y_true) else 0.0,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "confusion": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
        "false_positive_rate": fp / (fp + tn) if fp + tn else 0.0,
        "false_negative_rate": fn / (fn + tp) if fn + tp else 0.0,
    }


def tune_threshold(y_true: np.ndarray, scores: np.ndarray) -> tuple[float, dict[str, object]]:
    candidates = np.unique(np.concatenate((scores.astype(np.float64), np.asarray([0.0, 1.0]))))
    best: tuple[tuple[float, float, float], float, dict[str, object]] | None = None
    for threshold in candidates:
        metrics = binary_metrics(y_true, scores >= threshold)
        # F1 first, then precision, then prefer the higher cutoff on a tie.
        key = (float(metrics["f1"]), float(metrics["precision"]), float(threshold))
        if best is None or key > best[0]:
            best = (key, float(threshold), metrics)
    assert best is not None
    return best[1], best[2]


def tune_hybrid_threshold(
    y_true: np.ndarray, model_scores: np.ndarray, rule_predictions: np.ndarray
) -> tuple[float, dict[str, object]]:
    candidates = np.unique(
        np.concatenate((model_scores.astype(np.float64), np.asarray([0.0, 1.0])))
    )
    best: tuple[tuple[float, float, float], float, dict[str, object]] | None = None
    for threshold in candidates:
        metrics = binary_metrics(y_true, rule_predictions | (model_scores >= threshold))
        key = (float(metrics["f1"]), float(metrics["precision"]), float(threshold))
        if best is None or key > best[0]:
            best = (key, float(threshold), metrics)
    assert best is not None
    return best[1], best[2]


def score_estimator(estimator: object, matrix: object) -> np.ndarray:
    return estimator.predict_proba(matrix)[:, 1]


def logistic_export(model: LogisticRegression) -> dict[str, object]:
    return {
        "kind": "logistic_regression",
        "coef": model.coef_[0].astype(float).tolist(),
        "intercept": float(model.intercept_[0]),
    }


def nb_export(model: MultinomialNB) -> dict[str, object]:
    return {
        "kind": "multinomial_nb",
        "featureLogProb": model.feature_log_prob_.astype(float).tolist(),
        "classLogPrior": model.class_log_prior_.astype(float).tolist(),
    }


def pct(value: float) -> str:
    return f"{100 * value:.2f}%"


def metric_table(metrics: dict[str, object]) -> list[str]:
    confusion = metrics["confusion"]
    return [
        f"| Accuracy | {pct(metrics['accuracy'])} |",
        f"| Precision (Phishing) | {pct(metrics['precision'])} |",
        f"| Recall (Phishing) | {pct(metrics['recall'])} |",
        f"| F1-score (Phishing) | {pct(metrics['f1'])} |",
        f"| False positive rate | {pct(metrics['false_positive_rate'])} |",
        f"| False negative rate | {pct(metrics['false_negative_rate'])} |",
        f"| Confusion matrix (TN, FP, FN, TP) | {confusion['tn']}, {confusion['fp']}, {confusion['fn']}, {confusion['tp']} |",
    ]


def main() -> None:
    texts, labels, data_counts = load_dataset()
    all_indices = np.arange(len(texts))
    train_idx, remaining_idx = train_test_split(
        all_indices,
        test_size=0.30,
        random_state=RANDOM_STATE,
        stratify=labels,
    )
    validation_idx, test_idx = train_test_split(
        remaining_idx,
        test_size=0.50,
        random_state=RANDOM_STATE,
        stratify=labels[remaining_idx],
    )
    train_texts = [texts[index] for index in train_idx]
    validation_texts = [texts[index] for index in validation_idx]
    test_texts = [texts[index] for index in test_idx]
    y_train, y_validation, y_test = labels[train_idx], labels[validation_idx], labels[test_idx]

    vectorizer = TfidfVectorizer(
        lowercase=True,
        strip_accents=None,
        token_pattern=TOKEN_PATTERN,
        ngram_range=(1, 2),
        min_df=2,
        max_features=100000,
        sublinear_tf=False,
        smooth_idf=True,
        norm="l2",
        dtype=np.float64,
    )
    x_train = vectorizer.fit_transform(train_texts)
    x_validation = vectorizer.transform(validation_texts)
    x_test = vectorizer.transform(test_texts)

    logistic = LogisticRegression(
        class_weight="balanced",
        max_iter=1500,
        solver="liblinear",
        random_state=RANDOM_STATE,
    )
    logistic.fit(x_train, y_train)
    naive_bayes = MultinomialNB(alpha=0.5)
    naive_bayes.fit(x_train, y_train)

    p_lr_validation = score_estimator(logistic, x_validation)
    p_nb_validation = score_estimator(naive_bayes, x_validation)
    p_lr_test = score_estimator(logistic, x_test)
    p_nb_test = score_estimator(naive_bayes, x_test)

    rule_scores = score_existing_rules(validation_texts + test_texts)
    split_rule_scores = (
        np.asarray([item["riskScore"] for item in rule_scores], dtype=np.float64) / 100.0
    )
    val_rules = split_rule_scores[: len(validation_idx)]
    test_rules = split_rule_scores[len(validation_idx) :]
    val_rule_prediction = val_rules >= 0.55
    test_rule_prediction = test_rules >= 0.55

    model_validation_probabilities = {
        "TF-IDF + Logistic Regression": p_lr_validation,
        "TF-IDF + Multinomial Naive Bayes": p_nb_validation,
    }
    model_test_probabilities = {
        "TF-IDF + Logistic Regression": p_lr_test,
        "TF-IDF + Multinomial Naive Bayes": p_nb_test,
    }
    selected_thresholds: dict[str, float] = {}
    validation_results: dict[str, dict[str, object]] = {
        "Existing rule-based analyzer (default threshold)": binary_metrics(
            y_validation, val_rule_prediction
        )
    }
    test_results: dict[str, dict[str, object]] = {
        "Existing rule-based analyzer (default threshold)": binary_metrics(
            y_test, test_rule_prediction
        )
    }

    for name in model_validation_probabilities:
        threshold, metrics = tune_threshold(y_validation, model_validation_probabilities[name])
        selected_thresholds[name] = threshold
        validation_results[name] = metrics
        test_results[name] = binary_metrics(
            y_test, model_test_probabilities[name] >= threshold
        )

    for name, val_probability, test_probability in (
        ("Hybrid: rules OR Logistic Regression", p_lr_validation, p_lr_test),
        ("Hybrid: rules OR Multinomial Naive Bayes", p_nb_validation, p_nb_test),
    ):
        threshold, metrics = tune_hybrid_threshold(
            y_validation, val_probability, val_rule_prediction
        )
        selected_thresholds[name] = threshold
        validation_results[name] = metrics
        test_results[name] = binary_metrics(
            y_test, test_rule_prediction | (test_probability >= threshold)
        )

    hybrid_names = [
        "Hybrid: rules OR Logistic Regression",
        "Hybrid: rules OR Multinomial Naive Bayes",
    ]
    selected_hybrid = max(
        hybrid_names,
        key=lambda name: (
            validation_results[name]["f1"],
            validation_results[name]["precision"],
            selected_thresholds[name],
        ),
    )
    if selected_hybrid.endswith("Logistic Regression"):
        export = logistic_export(logistic)
        chosen_source = "logistic_regression"
    else:
        export = nb_export(naive_bayes)
        chosen_source = "multinomial_nb"

    integration_threshold = selected_thresholds[selected_hybrid]
    chosen_model_only = "TF-IDF + Logistic Regression" if chosen_source == "logistic_regression" else "TF-IDF + Multinomial Naive Bayes"
    selected_test_probability = model_test_probabilities[chosen_model_only]
    deploy_prediction = test_rule_prediction | (selected_test_probability >= integration_threshold)
    deploy_metrics = binary_metrics(y_test, deploy_prediction)
    baseline_test_metrics = test_results["Existing rule-based analyzer (default threshold)"]
    deployable = (
        deploy_metrics["f1"] > baseline_test_metrics["f1"]
        and deploy_metrics["recall"] > baseline_test_metrics["recall"]
    )

    tokenizer_feature_names = vectorizer.get_feature_names_out()
    if not np.all(tokenizer_feature_names[:-1] <= tokenizer_feature_names[1:]):
        raise RuntimeError("The exported vectorizer features are not sorted for runtime lookup.")
    model_artifact = {
        "schemaVersion": 1,
        "modelVersion": "1.0.0",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "id": "zefang-liu/phishing-email-dataset",
            "revision": DATASET_REVISION,
            "split": "train",
            "deduplication": "NFC/whitespace normalized, case-insensitive exact text before split; conflicting-label duplicates excluded",
            "randomState": RANDOM_STATE,
        },
        "training": {
            "scikitLearn": sklearn.__version__,
            "python": sys.version.split()[0],
            "vectorizer": {
                "type": "TfidfVectorizer",
                "lowercase": True,
                "tokenPattern": TOKEN_PATTERN,
                "ngramRange": [1, 2],
                "minDf": 2,
                "maxFeatures": 100000,
                "smoothIdf": True,
                "sublinearTf": False,
                "norm": "l2",
            },
            "estimator": export,
            "featureNames": tokenizer_feature_names.tolist(),
            "idf": vectorizer.idf_.astype(float).tolist(),
            "threshold": integration_threshold,
            "hybridRuleCutoff": 0.55,
            "legitimateOtpSuppression": True,
            "selectedValidationCandidate": selected_hybrid,
        },
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(model_artifact, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    runtime_result = subprocess.run(
        ["node", str(ROOT / "scripts" / "score-email-model.mjs")],
        cwd=ROOT,
        input=json.dumps(test_texts, ensure_ascii=False),
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )
    runtime_probabilities = np.asarray(json.loads(runtime_result.stdout), dtype=np.float64)
    if runtime_probabilities.shape != selected_test_probability.shape or not np.allclose(
        runtime_probabilities, selected_test_probability, rtol=1e-8, atol=1e-9
    ):
        max_error = (
            float(np.max(np.abs(runtime_probabilities - selected_test_probability)))
            if runtime_probabilities.shape == selected_test_probability.shape
            else float("inf")
        )
        mismatch_index = (
            int(np.argmax(np.abs(runtime_probabilities - selected_test_probability)))
            if runtime_probabilities.shape == selected_test_probability.shape
            else -1
        )
        raise RuntimeError(
            f"Exported {chosen_source} runtime model does not match scikit-learn "
            f"(max error {max_error}; runtime={runtime_probabilities[:3].tolist()}, "
            f"expected={selected_test_probability[:3].tolist()}, mismatch_index={mismatch_index}, "
            f"email={test_texts[mismatch_index][:500] if mismatch_index >= 0 else ''})."
        )
    model_digest = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()

    safe_otp = (
        "Your sign-in verification code is 482916. It expires in 10 minutes. "
        "Do not share this code with anyone."
    )
    malicious_otp = (
        "PayPal security alert: reply with your one-time password immediately to stop "
        "your account from being suspended."
    )
    otp_rule_scores = score_existing_rules([safe_otp, malicious_otp])
    otp_matrix = vectorizer.transform([safe_otp, malicious_otp])
    otp_probability = score_estimator(logistic if chosen_source == "logistic_regression" else naive_bayes, otp_matrix)
    otp_hybrid_prediction = []
    for i, item in enumerate(otp_rule_scores):
        explicit_otp_request = item["category"] == "OTP_PHISHING"
        legitimate_otp = item["category"] == "LEGITIMATE_OTP" and not explicit_otp_request
        otp_hybrid_prediction.append(
            False if legitimate_otp else (
                item["riskScore"] >= 55 or otp_probability[i] >= integration_threshold
            )
        )
    if otp_hybrid_prediction[0]:
        raise AssertionError("Legitimate OTP notification was classified as phishing by hybrid.")
    if not otp_hybrid_prediction[1]:
        raise AssertionError("Explicit OTP theft example was not classified as phishing by hybrid.")

    report_lines = [
        "# Phishing Email ML Experiment",
        "",
        f"Evaluated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Dataset and protocol",
        "",
        "- Source: [Hugging Face `zefang-liu/phishing-email-dataset`](https://huggingface.co/datasets/zefang-liu/phishing-email-dataset)",
        f"- Pinned dataset revision: `{DATASET_REVISION}`; CSV columns: `Email Text`, `Email Type`, `Unnamed: 0` (ignored).",
        f"- Raw rows: {data_counts['source_rows']}; empty rows skipped: {data_counts['empty_rows']}; unknown labels: {data_counts['unknown_label_rows']}.",
        f"- Exact duplicate rows removed before splitting: {data_counts['duplicate_rows_removed']}; conflicting-label duplicate groups excluded: {data_counts['conflicting_duplicate_groups_removed']}; unique examples: {data_counts['unique_rows']}.",
        "- Label mapping: `Safe Email` → 0/Safe; `Phishing Email` → 1/Phishing.",
        "- Text cleaning: Unicode NFC; control characters removed/replaced; whitespace collapsed; case-insensitive exact-text deduplication; max 12,000 characters for vectorization and analyzer parity.",
        "- Stratified split: 70% train / 15% validation / 15% test, seed 42. The vectorizer and estimators are fit only on train. Thresholds and hybrid candidate are selected only on validation. Test is held out and used once for final metrics.",
        f"- Split sizes: train {len(train_idx)}, validation {len(validation_idx)}, test {len(test_idx)}. Test class counts: {int(np.sum(y_test == 0))} Safe, {int(np.sum(y_test == 1))} Phishing.",
        "- Rule baseline is the existing TypeScript `analyzeEmailThreat` implementation (not a reimplementation), with its current 55/100 REVIEW cutoff. No Gmail/API calls are made.",
        "- Logistic Regression uses `class_weight=balanced`, `liblinear`, seed 42; Naive Bayes is `MultinomialNB(alpha=0.5)`. Both use train-fit word TF-IDF with unigrams/bigrams, `min_df=2`, `max_features=100000`, L2 normalization.",
        "- ML phishing decision threshold is tuned by maximum validation F1; ties use higher precision, then higher threshold. Hybrid decisions are existing rule score >= 55 OR ML probability >= its validation-tuned threshold. No test threshold tuning.",
        "- Binary detection treats both REVIEW and QUARANTINE as phishing. These benchmark predictions do not label, move, or delete mail.",
        "",
        "## Thresholds chosen on validation",
        "",
        "| Candidate | Validation threshold | Validation F1 | Validation recall |",
        "|---|---:|---:|---:|",
    ]
    for candidate in (
        "TF-IDF + Logistic Regression",
        "TF-IDF + Multinomial Naive Bayes",
        *hybrid_names,
    ):
        report_lines.append(
            f"| {candidate} | {selected_thresholds[candidate]:.6f} | "
            f"{pct(validation_results[candidate]['f1'])} | "
            f"{pct(validation_results[candidate]['recall'])} |"
        )
    report_lines += [
        "",
        f"Best validation hybrid: **{selected_hybrid}** (selected before reading test metrics).",
        "",
        "## Independent test results",
        "",
        "| Model | Accuracy | Precision | Recall | F1 | FPR | FNR | TN / FP / FN / TP |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    display_order = [
        "Existing rule-based analyzer (default threshold)",
        "TF-IDF + Logistic Regression",
        "TF-IDF + Multinomial Naive Bayes",
        "Hybrid: rules OR Logistic Regression",
        "Hybrid: rules OR Multinomial Naive Bayes",
    ]
    for candidate in display_order:
        metrics = test_results[candidate]
        confusion = metrics["confusion"]
        report_lines.append(
            f"| {candidate} | {pct(metrics['accuracy'])} | {pct(metrics['precision'])} | "
            f"{pct(metrics['recall'])} | {pct(metrics['f1'])} | "
            f"{pct(metrics['false_positive_rate'])} | {pct(metrics['false_negative_rate'])} | "
            f"{confusion['tn']} / {confusion['fp']} / {confusion['fn']} / {confusion['tp']} |"
        )

    if deployable:
        deployment_note = (
            f"**Validated for cautious integration on this dataset:** {selected_hybrid} improved both test F1 "
            f"({pct(baseline_test_metrics['f1'])} → {pct(deploy_metrics['f1'])}) and test recall "
            f"({pct(baseline_test_metrics['recall'])} → {pct(deploy_metrics['recall'])}). It only adds REVIEW-level "
            "flags; deterministic QUARANTINE rules remain authoritative. Legitimate OTP notifications are explicitly exempted."
        )
    else:
        deployment_note = (
            f"**Not integrated:** the validation-selected candidate did not improve both held-out test F1 and recall "
            f"over the existing rule baseline ({pct(baseline_test_metrics['f1'])} F1, "
            f"{pct(baseline_test_metrics['recall'])} recall). The trained artifact is saved for inspection, but "
            "test-set evidence does not justify changing production decisions."
        )

    report_lines += [
        "",
        "## Integration decision",
        "",
        deployment_note,
        "",
        "### OTP-specific regression checks",
        "",
        "| Fixture | Existing rule result | ML probability | Hybrid decision |",
        "|---|---|---:|---|",
        f"| Legitimate sign-in code notification | {otp_rule_scores[0]['riskLevel']} / {otp_rule_scores[0]['category']} | {otp_probability[0]:.6f} | {'PHISHING' if otp_hybrid_prediction[0] else 'SAFE'} |",
        f"| Explicit request to reply with OTP | {otp_rule_scores[1]['riskLevel']} / {otp_rule_scores[1]['category']} | {otp_probability[1]:.6f} | {'PHISHING' if otp_hybrid_prediction[1] else 'SAFE'} |",
        "",
        "The legitimate notification is suppressed from model-only escalation when the existing analyzer classifies it as `LEGITIMATE_OTP`; the explicit code-theft request remains flagged. These two fixtures are a safety regression check, not a population-level accuracy claim.",
        "The exported runtime scorer was parity-checked against the selected scikit-learn estimator on every held-out test email before reporting these results.",
        "",
        "## Versioned model artifact",
        "",
        f"- File: [`models/phishing-email-model.v1.json`](../models/phishing-email-model.v1.json)",
        f"- Model version: `{model_artifact['modelVersion']}`; schema version: `{model_artifact['schemaVersion']}`.",
        f"- Selected hybrid: `{selected_hybrid}`; model family: `{chosen_source}`; threshold: `{integration_threshold:.8f}`.",
        f"- Vocabulary size: {len(tokenizer_feature_names)}; artifact SHA-256: `{model_digest}`.",
        f"- Python `{sys.version.split()[0]}`, scikit-learn `{sklearn.__version__}`, NumPy `{np.__version__}`.",
        "",
        "## Limitations",
        "",
        "- This is one random split of one dataset; messages are historical and may contain duplicates/templates or source artifacts. It does not establish current deployment performance.",
        "- The dataset has no sender/subject fields. The rule baseline uses a fixed synthetic sender, empty subject, and no attachment names. Production Gmail supplies sender and subject, so measured rule behavior differs from production in those features.",
        "- A model may exploit dataset-specific vocabulary/style. Do not treat benchmark probability as proof of fraud.",
        "- No Gmail account, personal mailbox, email send, PayPal, or OpenAI integration was accessed.",
        "",
    ]
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(report_lines), encoding="utf-8")

    print(json.dumps({
        "deduplicated_rows": data_counts,
        "split_sizes": {"train": len(train_idx), "validation": len(validation_idx), "test": len(test_idx)},
        "selected_hybrid": selected_hybrid,
        "selected_threshold": integration_threshold,
        "test_results": test_results,
        "deployable": deployable,
        "model_sha256": model_digest,
        "report": str(REPORT_PATH),
        "model": str(MODEL_PATH),
    }, indent=2))


if __name__ == "__main__":
    main()
