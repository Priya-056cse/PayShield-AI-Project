import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadTypeScript(relativeFile) {
  const source = readFileSync(path.join(root, relativeFile), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      resolveJsonModule: true,
      esModuleInterop: true,
    },
  });
  const module = { exports: {} };
  const localRequire = (specifier) =>
    specifier === "server-only" ? {} : require(specifier);
  new Function("exports", "require", "module", compiled.outputText)(
    module.exports,
    localRequire,
    module
  );
  return module.exports;
}

const fixtures = JSON.parse(
  readFileSync(path.join(root, "fixtures", "invoice-emails.json"), "utf8")
).fixtures;
assert.ok(Array.isArray(fixtures) && fixtures.length > 0, "Fixtures must be a non-empty array.");

const { analyzeEmailThreat } = loadTypeScript("lib/securityAnalyzer.ts");
const { applyEmailClassifier, EMAIL_CLASSIFIER_INFO } = loadTypeScript("lib/emailClassifier.ts");
const { calculateRisk } = loadTypeScript("lib/riskEngine.ts");

function levelForScore(score) {
  if (score >= 85) return "QUARANTINE";
  if (score >= 55) return "NEEDS_REVIEW";
  return "SAFE";
}

console.log("Offline invoice email fixtures; no Gmail, PayPal, or AI requests are made.");
console.log(`Phishing model: ${EMAIL_CLASSIFIER_INFO.modelVersion} (${EMAIL_CLASSIFIER_INFO.estimator})`);

for (const fixture of fixtures) {
  const ruleAnalysis = analyzeEmailThreat({
    sender: fixture.sender,
    senderName: fixture.senderName,
    subject: fixture.subject,
    content: fixture.content,
  });
  const emailAnalysis = applyEmailClassifier(
    `${fixture.subject}\n${fixture.content}`.slice(0, 12000),
    ruleAnalysis
  );
  const invoiceAnalysis = calculateRisk({
    content: ruleAnalysis.redactedContent,
    sender: fixture.sender,
    amount: fixture.mockInvoice.amount,
    invoiceId: fixture.mockInvoice.id,
    paypalVerified: fixture.mockInvoice.paypalVerified,
    senderKnown: fixture.mockInvoice.senderKnown,
  });
  const combinedScore = Math.max(emailAnalysis.riskScore, invoiceAnalysis.risk_score);
  const combinedLevel = levelForScore(combinedScore);

  assert.equal(emailAnalysis.riskLevel, fixture.expectedEmailLevel, `${fixture.id}: email classification`);
  assert.equal(invoiceAnalysis.risk_level, fixture.expectedInvoiceLevel, `${fixture.id}: invoice rules`);
  assert.equal(combinedLevel, fixture.expectedEmailLevel, `${fixture.id}: overall classification`);

  console.log(`\n${fixture.id}`);
  console.log(`  Email:   ${emailAnalysis.riskScore}/100 ${emailAnalysis.riskLevel} (${emailAnalysis.category})`);
  console.log(`  Invoice: ${invoiceAnalysis.risk_score}/100 ${invoiceAnalysis.risk_level}`);
  console.log(`  PayPal:  MOCK ${fixture.mockInvoice.paypalVerified ? "VERIFIED" : "UNVERIFIED"} (${fixture.mockInvoice.id})`);
  console.log(`  Overall: ${combinedScore}/100 ${combinedLevel}`);
  console.log("  Detection reasons:");
  const reasons = Array.from(new Set([...emailAnalysis.reasons, ...invoiceAnalysis.reasons]));
  if (reasons.length === 0) console.log("    - No listed fraud indicators detected.");
  for (const reason of reasons) console.log(`    - ${reason}`);
}

console.log("\nLocal invoice email fixture checks passed.");
