# PayShield AI - Security Audit & Defense Architecture

This document summarizes the comprehensive security review, defense mechanisms, and compliance status of **PayShield AI**.

---

## 1. Security Review & Audit Checklist

| Security Control | Verification Method | Status | Findings & Implementation |
| :--- | :--- | :--- | :--- |
| **Secret Containment** | Codebase grep & bundle scan | **PASS** | No secrets (`PAYPAL_CLIENT_SECRET`, `OPENAI_API_KEY`, webhook IDs) are referenced in client code. Verified `import "server-only"` in `lib/env.ts`, `lib/paypal.ts`, `lib/ai.ts`, `lib/db.ts`, and `lib/analyzeWorkflow.ts`. Production build scan of `.next/static` confirmed 0 leaked keys. |
| **Webhook Signature Verification** | API implementation inspection | **PASS** | Mandatory fail-closed verification via PayPal's `v1/notifications/verify-webhook-signature` using the raw, unparsed request body (`req.text()`). Invalid signatures immediately return HTTP 401. Dev bypass requires both `NODE_ENV === "development"` and a dedicated dev secret header. |
| **Replay Attack Protection** | Idempotency event tracking | **PASS** | Processed webhook event IDs are recorded in `processed_webhook_events` table using SQLite primary key constraints. Replayed webhook events return HTTP 200 with `DUPLICATE_IGNORED` without re-executing analysis. |
| **Sandbox Isolation** | Host verification & environment checks | **PASS** | All PayPal API calls target `https://api-m.sandbox.paypal.com`. Environment mode is hard-guarded to `"sandbox"` in `lib/env.ts` and `lib/paypal.ts`; live PayPal mode is rejected with a fatal error. |
| **Input Validation & Sanitization** | Zod schema checks | **PASS** | Zod schemas validate every route (`POST /api/analyze`, `POST /api/webhooks/paypal`, `POST /api/reports/[id]/feedback`, `POST /api/dev/simulate-invoice`). Content length is capped at 5,000 characters; amounts must be non-negative and finite. |
| **IP Rate Limiting** | In-memory limiter tests | **PASS** | Sliding-window in-memory rate limiting applied to `POST /api/analyze` (10 req/min per IP) returning HTTP 429 with `Retry-After` header. Lighter limits protect feedback and dev endpoints (30 req/min). |
| **Masked Logging** | Regex auditing & test scans | **PASS** | `lib/logger.ts` intercepts all log statements and masks emails (`u***@domain.com`), bearer tokens (`Bearer [MASKED]`), OpenAI keys (`sk-***[MASKED]`), and card/account digit sequences (`[MASKED_DIGITS]`). |
| **Error Response Sanitization** | API response inspection | **PASS** | All error responses return structured, generic error messages (`{ error, code }`) without leaking raw database queries, internal stack traces, or upstream vendor diagnostics. |
| **SQL Injection Prevention** | Database query inspection | **PASS** | All database interactions in `lib/db.ts` use SQLite prepared statements with parameter placeholders (`?`). No string concatenation is used in SQL queries. Database files (`./data/`) and `.env.local` are git-ignored. |
| **HTTP Security Headers** | Header verification in `next.config.mjs` | **PASS** | Configured `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `Strict-Transport-Security`. `poweredByHeader` is disabled. |
| **Production Dev Guard** | Route environment check | **PASS** | Simulation route `POST /api/dev/simulate-invoice` and dashboard simulation buttons are conditionally gated and return HTTP 404 in production mode (`NODE_ENV === "production"`). |

---

## 2. Prompt-Injection Defense Architecture

Transaction memos, note fields, and user-controlled text strings represent untrusted input that attackers may weaponize to manipulate LLM reasoning.

PayShield AI implements a multi-tier defense:
1. **Rule Engine Authority**: Final risk scores and risk levels are determined **strictly by the deterministic rule engine** (`lib/riskEngine.ts`). AI reasoning never decides the final score.
2. **AI Safety Net Boundary**: The AI can only upgrade a `SAFE` transaction to `NEEDS_REVIEW` (score 55); it can **never** trigger `QUARANTINE` alone.
3. **Prompt Hardening**: The system prompt instructs the AI model to treat all transaction text as raw untrusted data, disregard any instructions embedded in memos, and emit structured JSON adhering strictly to a validated Zod schema.
4. **Fallback Resilience**: If an injection causes the LLM to output malformed JSON or fail validation, the system falls back to `AI_FALLBACK` (`category: "UNKNOWN"`, `confidence: "LOW"`) without impacting request availability.
