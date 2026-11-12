import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadTypeScript(relativeFile) {
  const source = require("node:fs").readFileSync(path.join(root, relativeFile), "utf8");
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
assert.equal(typeof classifier.predictPhishingProbability, "function");
assert.equal(typeof classifier.applyEmailClassifier, "function");

const safeOtp = "Your sign-in verification code is 482916. It expires in 10 minutes. Do not share this code with anyone.";
const phishingOtp = "PayPal security alert: reply with your one-time password immediately to stop your account from being suspended.";
const safeRules = analyzer.analyzeEmailThreat({
  sender: "notifications@example.com",
  subject: "",
  content: safeOtp,
});
const phishingRules = analyzer.analyzeEmailThreat({
  sender: "attacker@example.invalid",
  subject: "",
  content: phishingOtp,
});
const safeHybrid = classifier.applyEmailClassifier(safeOtp, safeRules);
const phishingHybrid = classifier.applyEmailClassifier(phishingOtp, phishingRules);

assert.equal(safeRules.category, "LEGITIMATE_OTP");
assert.equal(safeHybrid.riskLevel, "SAFE");
assert.notEqual(phishingHybrid.riskLevel, "SAFE");
assert.ok(phishingHybrid.riskScore >= 85, "Existing explicit OTP theft rule retains quarantine-level score.");
assert.ok(Number.isFinite(classifier.predictPhishingProbability("ordinary message text")));
assert.ok(await readFile(path.join(root, "models", "phishing-email-model.v1.json")));

console.log("Email classifier tests passed: legitimate OTP is safe; explicit OTP theft remains flagged.");
