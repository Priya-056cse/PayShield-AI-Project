import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = await readFile(path.join(root, "lib", "emailClassifier.ts"), "utf8");
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
const predict = module.exports.predictPhishingProbability;
if (typeof predict !== "function") {
  throw new Error("Email model inference function could not be loaded.");
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const emails = JSON.parse(input);
if (!Array.isArray(emails) || emails.some((email) => typeof email !== "string")) {
  throw new Error("Expected a JSON array of email strings on stdin.");
}
process.stdout.write(JSON.stringify(emails.map(predict)));
