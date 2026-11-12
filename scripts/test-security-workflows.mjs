import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
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

const analyzer = loadTypeScript("lib/securityAnalyzer.ts");
const classifier = loadTypeScript("lib/emailClassifier.ts");
const riskEngine = loadTypeScript("lib/riskEngine.ts");
const gmailSource = readFileSync(path.join(root, "lib", "gmail.ts"), "utf8");
const gmailRuleAnalysis = gmailSource.indexOf("const ruleAnalysis = analyzeEmailThreat");
const gmailHybridAnalysis = gmailSource.indexOf("applyEmailClassifier(", gmailRuleAnalysis);
const gmailPersistence = gmailSource.indexOf("const event = saveSecurityEvent", gmailHybridAnalysis);
const gmailLabelAction = gmailSource.indexOf("await applyDecisionLabel", gmailPersistence);

assert.ok(gmailRuleAnalysis >= 0, "Gmail processing invokes the deterministic analyzer.");
assert.ok(gmailHybridAnalysis > gmailRuleAnalysis, "Gmail processing applies the hybrid model after rules.");
assert.ok(gmailPersistence > gmailHybridAnalysis, "The combined decision is persisted after hybrid analysis.");
assert.ok(gmailLabelAction > gmailPersistence, "Gmail labels are applied after event persistence.");

const safeOtp = "Your sign-in verification code is 482916. It expires in 10 minutes. Do not share this code with anyone.";
const phishingOtp = "PayPal security alert: reply with your one-time password immediately to stop your account from being suspended.";
const safeOtpRules = analyzer.analyzeEmailThreat({
  sender: "notifications@example.com",
  subject: "",
  content: safeOtp,
});
const phishingOtpRules = analyzer.analyzeEmailThreat({
  sender: "attacker@example.invalid",
  subject: "",
  content: phishingOtp,
});
const safeOtpHybrid = classifier.applyEmailClassifier(safeOtp, safeOtpRules);
const phishingOtpHybrid = classifier.applyEmailClassifier(phishingOtp, phishingOtpRules);
assert.equal(safeOtpRules.category, "LEGITIMATE_OTP");
assert.equal(safeOtpHybrid.riskLevel, "SAFE");
assert.equal(phishingOtpRules.riskLevel, "QUARANTINE");
assert.equal(phishingOtpHybrid.riskLevel, "QUARANTINE", "ML must not lower a deterministic quarantine.");

const mlOnlyText = "Dear customer, your account has been temporarily limited. Please verify your account details to restore access.";
const mlOnlyRules = analyzer.analyzeEmailThreat({
  sender: "unknown@example.invalid",
  subject: "",
  content: mlOnlyText,
});
const mlOnlyHybrid = classifier.applyEmailClassifier(mlOnlyText, mlOnlyRules);
assert.equal(mlOnlyRules.riskLevel, "SAFE");
assert.equal(mlOnlyHybrid.category, "ML_PHISHING");
assert.equal(mlOnlyHybrid.riskLevel, "REVIEW");
assert.equal(mlOnlyHybrid.riskScore, 55);
assert.equal(classifier.EMAIL_CLASSIFIER_INFO.estimator, "multinomial_nb");
assert.ok(readFileSync(path.join(root, "models", "phishing-email-model.v1.json"), "utf8").length > 0);

const urlAnalysis = analyzer.analyzeUrlThreat("https://paypal-login.example.invalid/verify");
assert.equal(urlAnalysis.category, "SUSPICIOUS_URL");
assert.ok(urlAnalysis.riskScore >= 55);
const callAnalysis = analyzer.analyzeCallThreat({
  callerName: "PayPal customer support",
  description: "The agent asks me to read an OTP and transfer money immediately.",
});
assert.equal(callAnalysis.category, "OTP_THEFT_CALL");
assert.equal(callAnalysis.riskLevel, "QUARANTINE");
assert.match(callAnalysis.recommendedAction, /native call-screening integration/i);

const safeInvoice = riskEngine.calculateRisk({
  content: "",
  sender: "known@example.com",
  amount: 0,
  invoiceId: "SANDBOX-INVOICE-123",
  paypalVerified: true,
  senderKnown: true,
});
const unverifiedOtpInvoice = riskEngine.calculateRisk({
  content: "Please share your one-time password to authorize this payment.",
  sender: "unknown@example.invalid",
  amount: 599,
  invoiceId: "UNVERIFIED-INVOICE-123",
  paypalVerified: false,
  senderKnown: false,
});
assert.equal(safeInvoice.risk_level, "SAFE");
assert.equal(unverifiedOtpInvoice.risk_level, "QUARANTINE");

const priorPayPalEnv = {
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT,
};
process.env.PAYPAL_CLIENT_ID = "local-test-client";
process.env.PAYPAL_CLIENT_SECRET = "local-test-secret";
process.env.PAYPAL_ENVIRONMENT = "sandbox";
const env = loadTypeScript("lib/env.ts");
assert.equal(env.getPayPalConfig().environment, "sandbox");
process.env.PAYPAL_ENVIRONMENT = "live";
assert.throws(() => env.getPayPalConfig(), /must be "sandbox"/);
for (const [name, value] of Object.entries(priorPayPalEnv)) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), "payshield-security-test-"));
const priorDatabasePath = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(tempDir, "test.db");
let database;
try {
  database = loadTypeScript("lib/db.ts");
  const review = database.saveSecurityEvent({
    eventType: "EMAIL",
    source: "GMAIL",
    externalId: "offline-review-event",
    riskScore: mlOnlyHybrid.riskScore,
    category: mlOnlyHybrid.category,
    action: "REVIEW",
    summary: "Offline ML review workflow test",
    reasons: mlOnlyHybrid.reasons,
  });
  database.addSecurityAuditLog(review.id, "GMAIL_REVIEW_LABEL", "Review-label workflow test.");
  assert.equal(database.getSecurityEventByExternalId("offline-review-event").category, "ML_PHISHING");

  const quarantine = database.saveSecurityEvent({
    eventType: "EMAIL",
    source: "GMAIL",
    externalId: "offline-quarantine-event",
    riskScore: phishingOtpHybrid.riskScore,
    category: phishingOtpHybrid.category,
    action: "QUARANTINED",
    summary: "Offline deterministic quarantine workflow test",
    reasons: phishingOtpHybrid.reasons,
  });
  database.addSecurityAuditLog(quarantine.id, "GMAIL_QUARANTINED", "Quarantine-label workflow test.");
  const dashboard = database.getSecurityDashboardData();
  assert.equal(dashboard.metrics.emailsAnalyzed, 2);
  assert.equal(dashboard.metrics.threatsDetected, 2);
  assert.equal(dashboard.metrics.emailsQuarantined, 1);
  assert.ok(dashboard.auditLogs.some((log) => log.action === "GMAIL_REVIEW_LABEL"));
  assert.ok(dashboard.auditLogs.some((log) => log.action === "GMAIL_QUARANTINED"));

  const duplicate = database.saveSecurityEvent({
    eventType: "EMAIL",
    source: "GMAIL",
    externalId: "offline-review-event",
    riskScore: 0,
    category: "DUPLICATE",
    action: "SAFE",
    summary: "Must not replace the first event",
    reasons: [],
  });
  assert.equal(duplicate.id, review.id);
  assert.equal(database.getSecurityDashboardData().metrics.emailsAnalyzed, 2);
} finally {
  if (database) database.getDb().close();
  if (priorDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = priorDatabasePath;
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("Security workflow tests passed: Gmail hybrid wiring, OTP/quarantine precedence, ML review persistence, audit logs, dashboard metrics, sandbox guard, URL/call rules, and invoice rules.");
