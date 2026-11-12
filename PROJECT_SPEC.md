# TARGET ARCHITECTURE

STACK: Next.js 14 App Router, TypeScript strict, Tailwind, SQLite via better-sqlite3 (local file ./data/payshield.db, folder git-ignored), Vercel AI SDK ("ai" + "@ai-sdk/openai"), zod, "@paypal/agent-toolkit" (import from "@paypal/agent-toolkit/ai-sdk"). PayPal SANDBOX ONLY. No other new dependencies.

FILE MAP:
- .env.example, lib/env.ts (server-only, zod-validated, clear error messages)
- types/invoice.ts: InvoiceAnalysis, RiskLevel, RiskReport, QuarantineItem, PayPalInvoice
- lib/db.ts (SQLite + CRUD), lib/riskEngine.ts (pure deterministic functions), lib/ai.ts (analyzeWithAI), lib/paypal.ts (toolkit + helpers)
- lib/analyzeWorkflow.ts: shared function runAnalysis(input) used by BOTH the API route and the webhook
- lib/rateLimit.ts (in-memory, no dependency), lib/logger.ts (masks emails, tokens, API keys, amounts optional)
- app/api/analyze/route.ts, app/api/webhooks/paypal/route.ts, app/api/reports/route.ts (GET list), app/api/reports/[id]/feedback/route.ts (POST), app/api/dev/simulate-invoice/route.ts (dev only)
- app/dashboard/page.tsx + reusable components in components/dashboard/*

TYPES:
- RiskLevel = "SAFE" | "NEEDS_REVIEW" | "QUARANTINE"
- Risk bands: 0-54 SAFE, 55-84 NEEDS_REVIEW, 85-100 QUARANTINE. Score is integer clamped 0..100.
- AI category: "PHISHING" | "FAKE_INVOICE" | "IMPERSONATION" | "SAFE" | "UNKNOWN"; AI confidence: "LOW" | "MEDIUM" | "HIGH".

RULE ENGINE WEIGHTS (deterministic, exported as constants, each rule returns {triggered, points, reason}):
- invoiceId provided but NOT found in PayPal sandbox: +30
- no invoiceId provided (cannot verify): +15
- unknown sender (no prior MARK_SAFE feedback for this sender in user_feedback): +15
- urgency language (urgent, immediately, within 24 hours, final notice, account suspended, act now): +15
- asks for OTP / password / PIN / bank details / card number / CVV: +35
- contains external link (http/https/www or shortened URLs): +15
- high amount: >= 1000 -> +10, >= 5000 -> +20 (only the higher applies)
- suspicious instructions (call this number, gift cards, crypto, wire transfer, remote access/AnyDesk/TeamViewer, "refund" overpayment tricks): +25
- OVERRIDE: if credential request is triggered AND paypal_verified is false, final score is at least 85.
Sum, clamp to 100, map to level. Return {risk_score, risk_level, reasons[], recommended_action, triggered_rules[]}.

AI ROLE: AI NEVER decides the final score. Final risk_score and risk_level come ONLY from the rule engine. AI provides category, reasons, confidence and a wording of the recommended action. Safety net: if AI risk_score >= 85 and rule level is SAFE, upgrade level to NEEDS_REVIEW (score becomes 55). AI alone can never cause QUARANTINE. If AI fails or returns invalid JSON, use fallback {category:"UNKNOWN", confidence:"LOW", reasons:["AI analysis unavailable; rule-based result used"]} and never crash the request.

DB TABLES:
- invoices(id TEXT PK, paypal_invoice_id TEXT, sender TEXT, amount REAL, currency TEXT, note TEXT, status TEXT, source TEXT CHECK in ('API','WEBHOOK','SIMULATED'), created_at TEXT)
- risk_reports(id, invoice_id, sender, amount, content, risk_score, risk_level, category, reasons TEXT(JSON array), recommended_action, paypal_verified INTEGER(0/1), ai_confidence, created_at, updated_at)
- quarantine_items(id, risk_report_id FK, invoice_id, status CHECK in ('QUARANTINED','RELEASED','REPORTED_SCAM'), reason, created_at, resolved_at)
- user_feedback(id, risk_report_id FK, action CHECK in ('MARK_SAFE','REPORT_SCAM'), note, created_at)
- processed_webhook_events(event_id TEXT PK, received_at TEXT)
All SQL uses prepared statements (no string concatenation). IDs via crypto.randomUUID().

ANALYZE API RESPONSE (exact): { id, invoice_id, sender, amount, paypal_verified, risk_score, risk_level, category, reasons, recommended_action, ai_confidence, created_at }

SECURITY RULES: secrets only in server code (import "server-only"), never NEXT_PUBLIC_ for secrets; all PayPal calls to https://api-m.sandbox.paypal.com; reject PAYPAL_ENVIRONMENT=live; webhook signature verified with PayPal verify-webhook-signature API using raw body (reject with 401 if invalid); zod validation on every route; content max 5000 chars; rate limit on /api/analyze (10 req/min per IP, return 429 + Retry-After); logs must mask sensitive data; error responses never leak stack traces or secrets.

CONVENTIONS: strict TypeScript, no "any", small modular files, JSDoc comments on every exported function, must pass: npm run type-check, npm run lint, npm run build, npm run dev.
