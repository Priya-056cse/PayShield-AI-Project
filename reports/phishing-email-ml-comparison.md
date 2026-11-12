# Phishing Email ML Experiment

Evaluated: 2026-11-11T11:08:39.373186+00:00

## Dataset and protocol

- Source: [Hugging Face `zefang-liu/phishing-email-dataset`](https://huggingface.co/datasets/zefang-liu/phishing-email-dataset)
- Pinned dataset revision: `34085a032c123ca237f314a01a67909cdea35e34`; CSV columns: `Email Text`, `Email Type`, `Unnamed: 0` (ignored).
- Raw rows: 18650; empty rows skipped: 19; unknown labels: 0.
- Exact duplicate rows removed before splitting: 1117; conflicting-label duplicate groups excluded: 1; unique examples: 17513.
- Label mapping: `Safe Email` → 0/Safe; `Phishing Email` → 1/Phishing.
- Text cleaning: Unicode NFC; control characters removed/replaced; whitespace collapsed; case-insensitive exact-text deduplication; max 12,000 characters for vectorization and analyzer parity.
- Stratified split: 70% train / 15% validation / 15% test, seed 42. The vectorizer and estimators are fit only on train. Thresholds and hybrid candidate are selected only on validation. Test is held out and used once for final metrics.
- Split sizes: train 12259, validation 2627, test 2627. Test class counts: 1646 Safe, 981 Phishing.
- Rule baseline is the existing TypeScript `analyzeEmailThreat` implementation (not a reimplementation), with its current 55/100 REVIEW cutoff. No Gmail/API calls are made.
- Logistic Regression uses `class_weight=balanced`, `liblinear`, seed 42; Naive Bayes is `MultinomialNB(alpha=0.5)`. Both use train-fit word TF-IDF with unigrams/bigrams, `min_df=2`, `max_features=100000`, L2 normalization.
- ML phishing decision threshold is tuned by maximum validation F1; ties use higher precision, then higher threshold. Hybrid decisions are existing rule score >= 55 OR ML probability >= its validation-tuned threshold. No test threshold tuning.
- Binary detection treats both REVIEW and QUARANTINE as phishing. These benchmark predictions do not label, move, or delete mail.

## Thresholds chosen on validation

| Candidate | Validation threshold | Validation F1 | Validation recall |
|---|---:|---:|---:|
| TF-IDF + Logistic Regression | 0.499991 | 97.46% | 97.86% |
| TF-IDF + Multinomial Naive Bayes | 0.166093 | 98.13% | 99.29% |
| Hybrid: rules OR Logistic Regression | 0.499991 | 97.26% | 97.86% |
| Hybrid: rules OR Multinomial Naive Bayes | 0.166093 | 97.99% | 99.29% |

Best validation hybrid: **Hybrid: rules OR Multinomial Naive Bayes** (selected before reading test metrics).

## Independent test results

| Model | Accuracy | Precision | Recall | F1 | FPR | FNR | TN / FP / FN / TP |
|---|---:|---:|---:|---:|---:|---:|---:|
| Existing rule-based analyzer (default threshold) | 62.73% | 100.00% | 0.20% | 0.41% | 0.00% | 99.80% | 1646 / 0 / 979 / 2 |
| TF-IDF + Logistic Regression | 97.60% | 95.63% | 98.06% | 96.83% | 2.67% | 1.94% | 1602 / 44 / 19 / 962 |
| TF-IDF + Multinomial Naive Bayes | 98.06% | 96.13% | 98.78% | 97.44% | 2.37% | 1.22% | 1607 / 39 / 12 / 969 |
| Hybrid: rules OR Logistic Regression | 97.60% | 95.63% | 98.06% | 96.83% | 2.67% | 1.94% | 1602 / 44 / 19 / 962 |
| Hybrid: rules OR Multinomial Naive Bayes | 98.06% | 96.13% | 98.78% | 97.44% | 2.37% | 1.22% | 1607 / 39 / 12 / 969 |

## Integration decision

**Validated for cautious integration on this dataset:** Hybrid: rules OR Multinomial Naive Bayes improved both test F1 (0.41% → 97.44%) and test recall (0.20% → 98.78%). It only adds REVIEW-level flags; deterministic QUARANTINE rules remain authoritative. Legitimate OTP notifications are explicitly exempted.

### OTP-specific regression checks

| Fixture | Existing rule result | ML probability | Hybrid decision |
|---|---|---:|---|
| Legitimate sign-in code notification | SAFE / LEGITIMATE_OTP | 0.457061 | SAFE |
| Explicit request to reply with OTP | QUARANTINE / OTP_PHISHING | 0.978949 | PHISHING |

The legitimate notification is suppressed from model-only escalation when the existing analyzer classifies it as `LEGITIMATE_OTP`; the explicit code-theft request remains flagged. These two fixtures are a safety regression check, not a population-level accuracy claim.
The exported runtime scorer was parity-checked against the selected scikit-learn estimator on every held-out test email before reporting these results.

## Versioned model artifact

- File: [`models/phishing-email-model.v1.json`](../models/phishing-email-model.v1.json)
- Model version: `1.0.0`; schema version: `1`.
- Selected hybrid: `Hybrid: rules OR Multinomial Naive Bayes`; model family: `multinomial_nb`; threshold: `0.16609273`.
- Vocabulary size: 100000; artifact SHA-256: `b96c7932f489d68fa96a9d58017f9b603048d2c6bb6cf423db0f1c9d1c221cfe`.
- Python `3.14.2`, scikit-learn `1.9.0`, NumPy `2.4.3`.

## Limitations

- This is one random split of one dataset; messages are historical and may contain duplicates/templates or source artifacts. It does not establish current deployment performance.
- The dataset has no sender/subject fields. The rule baseline uses a fixed synthetic sender, empty subject, and no attachment names. Production Gmail supplies sender and subject, so measured rule behavior differs from production in those features.
- A model may exploit dataset-specific vocabulary/style. Do not treat benchmark probability as proof of fraud.
- No Gmail account, personal mailbox, email send, PayPal, or OpenAI integration was accessed.
