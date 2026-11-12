import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = path.join(root, "lib", "securityAnalyzer.ts");
const defaultReport = path.join(root, "reports", "phishing-email-dataset-evaluation.md");
const cachedDataset = path.join(os.tmpdir(), "payshield-phishing-email-dataset.csv");
const datasetUrl =
  "https://huggingface.co/datasets/zefang-liu/phishing-email-dataset/resolve/34085a032c123ca237f314a01a67909cdea35e34/Phishing_Email.csv";
const datasetRevision = "34085a032c123ca237f314a01a67909cdea35e34";
const expectedRows = 18650;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function ensureDataset(csvPath) {
  try {
    if ((await stat(csvPath)).size > 0) return;
  } catch {
    // Download the pinned public dataset when no local CSV was supplied.
  }

  console.log(`Downloading the pinned Hugging Face CSV to ${csvPath}`);
  const response = await fetch(datasetUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) {
    throw new Error(`Dataset download failed with HTTP ${response.status}.`);
  }
  await mkdir(path.dirname(csvPath), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(csvPath));
}

function loadAnalyzer(source) {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  if (errors.length) {
    throw new Error(
      errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n")
    );
  }

  const module = { exports: {} };
  new Function("exports", "require", "module", result.outputText)(
    module.exports,
    require,
    module
  );
  if (typeof module.exports.analyzeEmailThreat !== "function") {
    throw new Error("Existing analyzer does not export analyzeEmailThreat.");
  }
  return module.exports.analyzeEmailThreat;
}

function parseCsv(text, onRow) {
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = text.charCodeAt(0) === 0xfeff ? 1 : 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) onRow(row);
      row = [];
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) onRow(row);
  }
  if (quoted) throw new Error("CSV ended inside a quoted field.");
}

function cleanEmail(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeSafeExcerpt(value) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/(?:\+?\d[\d(). -]{7,}\d)/g, "[PHONE]")
    .slice(0, 360);
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function metric(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function markdownTableSample(title, sample) {
  if (!sample) return `### ${title}\n\nNo correctly classified sample was available.\n`;
  return [
    `### ${title}`,
    "",
    `- Dataset label: **${sample.actual}**`,
    `- Analyzer result: **${sample.predicted}** (score ${sample.score}, category \`${sample.category}\`)`,
    `- Email excerpt (addresses and phone-like sequences redacted):`,
    "",
    `> ${sample.excerpt.replace(/\|/g, "\\|")}`,
    "",
  ].join("\n");
}

const csvPath = path.resolve(argument("--csv", cachedDataset));
const reportPath = path.resolve(argument("--report", defaultReport));
await ensureDataset(csvPath);

const csv = await readFile(csvPath, "utf8");
const analyzeEmailThreat = loadAnalyzer(await readFile(sourceFile, "utf8"));
let headers = null;
let textIndex = -1;
let labelIndex = -1;
let csvRows = 0;
let skippedEmpty = 0;
let skippedLabels = 0;
let total = 0;
let actualPhishing = 0;
let actualSafe = 0;
let predictedPhishingCount = 0;
let predictedSafe = 0;
let truePositive = 0;
let falsePositive = 0;
let trueNegative = 0;
let falseNegative = 0;
let safeSample = null;
let phishingSample = null;

parseCsv(csv, (row) => {
  if (!headers) {
    headers = row.map((header) => header.trim().replace(/^\uFEFF/, ""));
    textIndex = headers.indexOf("Email Text");
    labelIndex = headers.indexOf("Email Type");
    if (textIndex < 0 || labelIndex < 0) {
      throw new Error(`Expected "Email Text" and "Email Type" columns; found: ${headers.join(", ")}`);
    }
    return;
  }

  csvRows += 1;
  const email = cleanEmail(row[textIndex]);
  const label = String(row[labelIndex] || "").trim().toLowerCase();
  if (!email) {
    skippedEmpty += 1;
    return;
  }

  let isPhishing;
  if (label === "phishing email") isPhishing = true;
  else if (label === "safe email") isPhishing = false;
  else {
    skippedLabels += 1;
    return;
  }

  const analysis = analyzeEmailThreat({
    sender: "dataset@example.invalid",
    subject: "",
    content: email.slice(0, 12000),
  });
  const predictedPhishing = analysis.riskLevel !== "SAFE";
  total += 1;

  if (isPhishing) actualPhishing += 1;
  else actualSafe += 1;
  if (predictedPhishing) predictedPhishingCount += 1;

  if (isPhishing && predictedPhishing) truePositive += 1;
  else if (!isPhishing && predictedPhishing) falsePositive += 1;
  else if (!isPhishing && !predictedPhishing) trueNegative += 1;
  else falseNegative += 1;

  const sample = {
    actual: isPhishing ? "Phishing" : "Safe",
    predicted: predictedPhishing ? analysis.riskLevel : "SAFE",
    score: analysis.riskScore,
    category: analysis.category,
    excerpt: makeSafeExcerpt(email),
  };
  if (!isPhishing && !predictedPhishing && !safeSample) safeSample = sample;
  if (isPhishing && predictedPhishing && !phishingSample) phishingSample = sample;
});

if (!headers || textIndex < 0 || labelIndex < 0 || total === 0) {
  throw new Error("Dataset schema or valid labeled email rows were not found.");
}
if (Math.abs(csvRows - expectedRows) > 0) {
  throw new Error(`Expected ${expectedRows} dataset rows but parsed ${csvRows}; refusing partial evaluation.`);
}

predictedSafe = total - predictedPhishingCount;
const accuracy = metric(truePositive + trueNegative, total);
const precision = metric(truePositive, truePositive + falsePositive);
const recall = metric(truePositive, truePositive + falseNegative);
const f1 = metric(2 * precision * recall, precision + recall);
const falsePositiveRate = metric(falsePositive, actualSafe);

const report = [
  "# Phishing Email Dataset Evaluation",
  "",
  `Evaluated: ${new Date().toISOString()}`,
  "",
  "## Dataset and method",
  "",
  `- Source: [Hugging Face \`zefang-liu/phishing-email-dataset\`](https://huggingface.co/datasets/zefang-liu/phishing-email-dataset)`,
  `- Pinned dataset revision: \`${datasetRevision}\``,
  `- Re-run with \`node scripts/evaluate-phishing-email-dataset.mjs\`; the CSV is cached in the operating system temporary directory.`,
  `- Split: \`train\` (full dataset; this is a benchmark evaluation, not a held-out model-training split)`,
  `- CSV columns: \`Email Text\` (input), \`Email Type\` (ground truth), and \`Unnamed: 0\` (source row index, ignored)`,
  `- Rows in CSV: ${csvRows}; evaluated: ${total}; empty text skipped: ${skippedEmpty}; unrecognized labels skipped: ${skippedLabels}`,
  `- Label mapping: \`Phishing Email\` → Phishing; \`Safe Email\` → Safe`,
  `- Preprocessing: Unicode NFC, remove NUL/control characters, collapse whitespace, trim; truncate to the analyzer's 12,000-character input cap. No labels or features are inferred from the source row index.`,
  `- Analyzer: existing \`analyzeEmailThreat\` in [\`lib/securityAnalyzer.ts\`](../lib/securityAnalyzer.ts); sender is fixed to \`dataset@example.invalid\`, subject and attachments are empty because the dataset has no sender/subject columns.`,
  `- Binary decision: \`REVIEW\` or \`QUARANTINE\` means Phishing; \`SAFE\` means Safe. This follows the analyzer's 55-point review threshold.`,
  `- No Gmail, PayPal, OpenAI, mailbox, or email-sending integration was invoked.`,
  "",
  "## Results",
  "",
  "| Metric | Result |",
  "|---|---:|",
  `| Accuracy | ${percent(accuracy)} |`,
  `| Precision (Phishing) | ${percent(precision)} |`,
  `| Recall (Phishing) | ${percent(recall)} |`,
  `| F1-score (Phishing) | ${percent(f1)} |`,
  `| False positives | ${falsePositive} |`,
  `| False-positive rate (of Safe emails) | ${percent(falsePositiveRate)} |`,
  "",
  "| Confusion matrix | Predicted Safe | Predicted Phishing |",
  "|---|---:|---:|",
  `| Actual Safe | ${trueNegative} | ${falsePositive} |`,
  `| Actual Phishing | ${falseNegative} | ${truePositive} |`,
  "",
  `- Actual classes: ${actualSafe} Safe, ${actualPhishing} Phishing.`,
  `- Predictions: ${predictedSafe} Safe, ${predictedPhishingCount} Phishing.`,
  "",
  "## Correctly classified examples",
  "",
  markdownTableSample("Safe email classified as Safe", safeSample),
  markdownTableSample("Phishing email classified as Phishing", phishingSample),
  "## Interpretation",
  "",
  "This measures the current deterministic rules on this dataset, not Gmail integration or production performance. Dataset composition, historical messages, and the analyzer's fixed rules may not represent current or real-world phishing prevalence. Email excerpts are short and redact email addresses and phone-like sequences.",
  "",
  "Dataset license is listed as LGPL-3.0 on the Hugging Face dataset page; review the dataset card and original source terms before redistributing data.",
  "",
].join("\n");

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, report, "utf8");

console.log(`Parsed ${csvRows} rows; evaluated ${total} emails.`);
console.log(`Accuracy ${percent(accuracy)} | Precision ${percent(precision)} | Recall ${percent(recall)} | F1 ${percent(f1)}`);
console.log(`False positives ${falsePositive} (${percent(falsePositiveRate)} of safe emails).`);
console.log(`Report written to ${reportPath}`);
