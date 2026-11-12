# PayShield AI - Codebase Audit & Conflict Report

This document audits the pre-existing codebase against the **TARGET ARCHITECTURE** specified in `PROJECT_SPEC.md`.

---

## 1. Summary of Existing State

| Component / File | Current Implementation | Target Architecture Requirement | Status / Conflict |
| :--- | :--- | :--- | :--- |
| **Dependencies** (`package.json`) | `next`, `react`, `react-dom`, `clsx`, `tailwind-merge`, `lucide-react`, `server-only`. | `better-sqlite3`, `@types/better-sqlite3`, `ai`, `@ai-sdk/openai`, `zod`, `@paypal/agent-toolkit`. | **Missing target dependencies**. |
| **Environment** (`.env.example`) | Uses `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL_NAME` (Gemini), `PAYPAL_MODE=sandbox`, `RISK_QUARANTINE_THRESHOLD=75`. | Strict target schema: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `OPENAI_API_KEY`, `PAYPAL_ENVIRONMENT=sandbox`. Optional commented keys for webhook/model/db. | **Conflicts with Target Schema**. |
| **Environment Loader** (`lib/env.ts`) | Raw string access via `process.env`, allows `live` or `sandbox` PayPal environment, imports Gemini config. | Zod-validated, lazy getters, strict `PAYPAL_ENVIRONMENT="sandbox"` check, `server-only`. | **Must be rewritten**. |
| **Type Definitions** (`types/index.ts`) | Defines `RiskLevel = 'LOW' \| 'MEDIUM' \| 'HIGH' \| 'CRITICAL'`, `QuarantineStatus`, `ScamAnalysisResult`, `DashboardMetrics`. | `types/invoice.ts` with `RiskLevel = "SAFE" \| "NEEDS_REVIEW" \| "QUARANTINE"`, `InvoiceAnalysis`, `RiskReport`, `QuarantineItem`, `PayPalInvoice`. | **Type schema mismatch**. Must migrate to `types/invoice.ts`. |
| **Rule Engine** (`lib/riskEngine.ts`) | Does NOT exist. Old heuristics lived inside `lib/ai-analyzer.ts`. | Pure deterministic rule engine with exact weights, thresholds (0-54 SAFE, 55-84 NEEDS_REVIEW, 85-100 QUARANTINE), and credential override rule. | **Missing file**. Must create. |
| **AI Integration** (`lib/ai-analyzer.ts` vs `lib/ai.ts`) | `lib/ai-analyzer.ts` directly invoked Gemini REST API with mixed heuristics and returned old `ScamAnalysisResult`. | `lib/ai.ts` using Vercel AI SDK (`ai` + `@ai-sdk/openai`), fallback on failure, 15s timeout, AI never decides final score. | **Must replace with `lib/ai.ts`**. |
| **PayPal Client** (`lib/paypal.ts`) | Custom raw `fetch` calls to PayPal REST API, cancellation endpoint, checks `PAYPAL_MODE`. | Uses `@paypal/agent-toolkit/ai-sdk` (sandbox only), exports `verifyInvoiceExists`, `listInvoices`, `createSafeInvoice`, `getOrderDetails`, and webhook verification. | **Must be rewritten with toolkit**. |
| **Database** (`lib/db.ts`) | Does NOT exist. No persistence layer. | Local SQLite `./data/payshield.db` via `better-sqlite3` with WAL, foreign keys, 5 tables, prepared statements, and CRUD functions. | **Missing file**. Must create. |
| **Shared Workflow** (`lib/analyzeWorkflow.ts`) | Does NOT exist. Logic duplicated in `/api/analyze` and `/api/webhooks/paypal`. | Central `runAnalysis(input)` orchestrating PayPal verification, known sender check, rules, AI reasoning, DB storage, and quarantine. | **Missing file**. Must create. |
| **Rate Limiter & Logger** (`lib/rateLimit.ts`, `lib/logger.ts`) | Do NOT exist. | In-memory IP rate limiter (10 req/min for analyze); masked logger hiding emails, keys, and tokens. | **Missing files**. Must create. |
| **Analyze API** (`app/api/analyze/route.ts`) | Accepts `{ senderEmail, subjectOrMemo, type, amount }`, returns `{ success, result }`. | Zod validation `{ content: 1..5000, invoiceId: string\|null, sender: 1..200, amount >= 0 }`, rate-limited, exact target response format. | **Must be rewritten**. |
| **Webhook API** (`app/api/webhooks/paypal/route.ts`) | Reads body after parsing, optional verification toggle, synchronous execution. | Verifies raw body signature (fail-closed in production), deduplicates via SQLite, returns 200 immediately, processes async via `runAnalysis`. | **Must be rewritten**. |
| **Quarantine API** (`app/api/quarantine/route.ts`) | Standalone route cancelling invoices via raw fetch. | Superseded by `app/api/reports/[id]/feedback/route.ts` (`MARK_SAFE` / `REPORT_SCAM`). | **Must be deleted/replaced**. |
| **Reports API** (`app/api/reports/route.ts`) | Does NOT exist. | GET list with search `q`, `risk_level`, pagination `limit`/`offset`. | **Missing file**. Must create. |
| **Feedback API** (`app/api/reports/[id]/feedback/route.ts`) | Does NOT exist. | POST `{ action: "MARK_SAFE" \| "REPORT_SCAM" }` to update report, feedback, and quarantine tables. | **Missing file**. Must create. |
| **Dev Simulation API** (`app/api/dev/simulate-invoice/route.ts`) | Does NOT exist. | POST route (404 in production) simulating `safe`, `suspicious`, `scam` scenarios. | **Missing file**. Must create. |
| **Dashboard** (`app/dashboard/page.tsx`) | Renders `MOCK_SCANS` and `MOCK_METRICS` from `lib/constants.ts`. | Must render 100% real API data from `GET /api/reports`, poll every 15s, optimistic feedback actions, modular components. | **Must be rebuilt with real API data**. |
| **Mock Constants** (`lib/constants.ts`) | Contains `MOCK_METRICS` and `MOCK_SCANS`. | No fake data in production code. | **Must remove mock data**. |
| **Next.js Config** (`next.config.mjs`) | Standard Next config without external package declaration or security headers. | Needs `serverComponentsExternalPackages: ["better-sqlite3"]` and HTTP security headers. | **Must update config**. |

---

## 2. Decision & Preservation Strategy

- **Keep**:
  - Landing page (`app/page.tsx` and all `components/landing/*`)
  - Global styling, fonts, and dark theme (`app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`)
  - Shared UI components (`components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/badge.tsx`)
  - Navigation and footer (`components/navbar.tsx`, `components/footer.tsx`)
- **Replace / Modernize**:
  - All backend analysis, AI, PayPal, and environment utilities.
  - Type definitions migrated to `types/invoice.ts`.
  - Dashboard replaced with real-time API-driven UI and reusable components.
  - Complete SQLite database integration.
