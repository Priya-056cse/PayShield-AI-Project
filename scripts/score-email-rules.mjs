import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = await readFile(path.join(root, "lib", "securityAnalyzer.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const module = { exports: {} };
new Function("exports", "require", "module", compiled.outputText)(module.exports, require, module);
const analyzeEmailThreat = module.exports.analyzeEmailThreat;
if (typeof analyzeEmailThreat !== "function") {
  throw new Error("Existing analyzer does not export analyzeEmailThreat.");
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const emails = JSON.parse(input);
if (!Array.isArray(emails) || emails.some((email) => typeof email !== "string")) {
  throw new Error("Expected a JSON array of email strings on stdin.");
}
const results = emails.map((content) => {
  const analysis = analyzeEmailThreat({
    sender: "dataset@example.invalid",
    subject: "",
    content: content.slice(0, 12000),
  });
  return {
    riskScore: analysis.riskScore,
    riskLevel: analysis.riskLevel,
    category: analysis.category,
  };
});
process.stdout.write(JSON.stringify(results));
