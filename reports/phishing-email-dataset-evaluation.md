# Phishing Email Dataset Evaluation

Evaluated: 2026-11-11T10:25:35.945Z

## Dataset and method

- Source: [Hugging Face `zefang-liu/phishing-email-dataset`](https://huggingface.co/datasets/zefang-liu/phishing-email-dataset)
- Pinned dataset revision: `34085a032c123ca237f314a01a67909cdea35e34`
- Re-run with `node scripts/evaluate-phishing-email-dataset.mjs`; the CSV is cached in the operating system temporary directory.
- Split: `train` (full dataset; this is a benchmark evaluation, not a held-out model-training split)
- CSV columns: `Email Text` (input), `Email Type` (ground truth), and `Unnamed: 0` (source row index, ignored)
- Rows in CSV: 18650; evaluated: 18631; empty text skipped: 19; unrecognized labels skipped: 0
- Label mapping: `Phishing Email` → Phishing; `Safe Email` → Safe
- Preprocessing: Unicode NFC, remove NUL/control characters, collapse whitespace, trim; truncate to the analyzer's 12,000-character input cap. No labels or features are inferred from the source row index.
- Analyzer: existing `analyzeEmailThreat` in [`lib/securityAnalyzer.ts`](../lib/securityAnalyzer.ts); sender is fixed to `dataset@example.invalid`, subject and attachments are empty because the dataset has no sender/subject columns.
- Binary decision: `REVIEW` or `QUARANTINE` means Phishing; `SAFE` means Safe. This follows the analyzer's 55-point review threshold.
- No Gmail, PayPal, OpenAI, mailbox, or email-sending integration was invoked.

## Results

| Metric | Result |
|---|---:|
| Accuracy | 60.79% |
| Precision (Phishing) | 56.25% |
| Recall (Phishing) | 0.25% |
| F1-score (Phishing) | 0.49% |
| False positives | 14 |
| False-positive rate (of Safe emails) | 0.12% |

| Confusion matrix | Predicted Safe | Predicted Phishing |
|---|---:|---:|
| Actual Safe | 11308 | 14 |
| Actual Phishing | 7291 | 18 |

- Actual classes: 11322 Safe, 7309 Phishing.
- Predictions: 18599 Safe, 32 Phishing.

## Correctly classified examples

### Safe email classified as Safe

- Dataset label: **Safe**
- Analyzer result: **SAFE** (score 0, category `EMAIL`)
- Email excerpt (addresses and phone-like sequences redacted):

> re : 6 . 1100 , disc : uniformitarianism , re : 1086 ; sex / lang dick hudson 's observations on us use of 's on ' but not 'd aughter ' as a vocative are very thought-provoking , but i am not sure that it is fair to attribute this to " sons " being " treated like senior relatives " . for one thing , we do n't normally use ' brother ' in this way any more tha

### Phishing email classified as Phishing

- Dataset label: **Phishing**
- Analyzer result: **REVIEW** (score 60, category `CREDENTIAL_PHISHING`)
- Email excerpt (addresses and phone-like sequences redacted):

> urgent safeharbor department warning urgent safeharbor department warning we recently have determined that different computers have logged into your ebay account , and multiple password failures were present before the login one of our customer service employees has already tryed to telephonically reach you . as our employee did not manage to reach you , thi

## Interpretation

This measures the current deterministic rules on this dataset, not Gmail integration or production performance. Dataset composition, historical messages, and the analyzer's fixed rules may not represent current or real-world phishing prevalence. Email excerpts are short and redact email addresses and phone-like sequences.

Dataset license is listed as LGPL-3.0 on the Hugging Face dataset page; review the dataset card and original source terms before redistributing data.
