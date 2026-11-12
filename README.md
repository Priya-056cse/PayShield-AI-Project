# PayShield AI

> Gmail fraud analysis, reversible quarantine labels, offline URL checks, simulated call-risk scoring, and optional PayPal Sandbox invoice verification.

## Current implementation scope

The web app can poll one connected Gmail account (when a trusted scheduler calls the poll route), analyze new inbox messages, redact OTP-like values, and apply reversible Gmail review/quarantine labels. It includes offline URL pattern analysis and a simulated call-risk demo; it does not visit URLs, install browser blocking, or intercept/block real phone calls. PayPal calls are Sandbox-only. Deploy only behind a private access proxy with persistent storage and a trusted scheduler.

See [docs/WEB_PLATFORM.md](./docs/WEB_PLATFORM.md) for the exact APIs, OAuth scope, schema, security boundary, deployment requirements, and validation steps.

For local invoice-email fixtures, no Gmail OAuth or external account is needed: run `npm run test:local-fixtures`. It prints the email and mock-invoice risk results using the existing local analyzers; the fixtures do not send email, create invoices, or contact Google, PayPal, or OpenAI.

---

## 📖 1. Executive Summary & Problem Statement

### The Attack Vector: PayPal Invoice Abuse
One of the fastest-growing financial cyber threats is **PayPal Invoice Fraud**. Because invoices originate from legitimate PayPal merchant accounts, traditional spam filters allow these emails to land in users' inboxes.

1. **Email Filter Bypass**: Legitimate notifications from `service@paypal.com` reach the victim's primary inbox.
2. **Deceptive Note Injection**: Scammers craft invoice memos impersonating brands:
   > *"Geek Squad 3-Year Protection auto-renewed for $599.99. If unauthorized, call our helpline immediately at +1-800-555-0199 within 24 hours. Enter your one-time password OTP when prompted."*
3. **The Extortion Trap**: Unwary recipients panic, dial the toll-free number, and connect with fraudulent call centers that attempt remote access extortion, wire transfers, or credential harvesting.

### The PayShield AI Solution
**PayShield AI** acts as an autonomous defense agent:
- Ingests incoming PayPal webhook events (`INVOICING.INVOICE.CREATED`, `.SENT`).
- Verifies invoice existence and authenticity against the PayPal Sandbox via the **PayPal Agent Toolkit**.
- Evaluates deterministic heuristic rules (urgency, callback traps, credential requests, external links, unverified senders).
- Employs **Vercel AI SDK** with OpenAI as a semantic safety net (AI never dictates final score).
- Automatically locks high-risk transactions into **Quarantine** and presents plain-language explanations on the live security dashboard.

---

## 🏛️ 2. System Architecture

```text
+-----------------------+        +--------------------------+
| Incoming Webhook      |        | Interactive Dashboard    |
| (PayPal Sandbox Event)|        | (/api/analyze or UI Test)|
+-----------+-----------+        +------------+-------------+
            |                                 |
            +----------------+----------------+
                             |
                             v
                 +-----------------------+
                 | Rate Limiting & Zod   |
                 | Payload Validation    |
                 +-----------+-----------+
                             |
                             v
                 +-----------------------+
                 |  runAnalysis Workflow |
                 +-----------+-----------+
                             |
       +---------------------+---------------------+
       |                                           |
       v                                           v
+-------------------------------+   +-------------------------------+
| PayPal Agent Toolkit Verify   |   | SQLite Known Sender Check     |
| verifyInvoiceExists (Sandbox) |   | (user_feedback history)       |
+---------------+---------------+   +---------------+---------------+
                |                                   |
                +-----------------+-----------------+
                                  |
                                  v
                 +---------------------------------+
                 | Deterministic Rule Engine       |
                 | (lib/riskEngine.ts: Pure Rules) |
                 +----------------+----------------+
                                  |
                                  v
                 +---------------------------------+
                 | Vercel AI SDK Semantic Safety   |
                 | (lib/ai.ts: analyzeWithAI)      |
                 +----------------+----------------+
                                  |
                                  v
                 +---------------------------------+
                 | Final Score Combination         |
                 | (Rules dictate score; AI safety)|
                 +----------------+----------------+
                                  |
                                  v
                 +---------------------------------+
                 | SQLite Database Persistence     |
                 | (invoices, reports, quarantine) |
                 +----------------+----------------+
                                  |
                                  v
                 +---------------------------------+
                 | Live Real-Time Dashboard        |
                 | (GET /api/reports, SWR Polling) |
                 +---------------------------------+
```

---

## 🛠️ 3. PayPal Tools & Capabilities Used

PayShield AI integrates with `@paypal/agent-toolkit/ai-sdk` restricted strictly to Sandbox mode:

| Tool Group | Tools Configured | Purpose in PayShield AI |
| :--- | :--- | :--- |
| **Invoices** | `create_invoice`, `list_invoices`, `send_invoice` | Validates sandbox invoice records, lists active invoices, and issues safe merchant invoices. |
| **Orders** | `create_order`, `get_order` | Retrieves order details for payment request inspection. |
| **Disputes** | `list_disputes`, `get_dispute` | Inspects open claims and dispute histories. |
| **Webhooks** | `verifyWebhookSignature` | Cryptographically verifies incoming PayPal webhook transmission signatures against PayPal Sandbox APIs. |

---

## ⚡ 4. Tech Stack

- **Framework**: Next.js 14 App Router (React 18, TypeScript Strict)
- **Styling**: Tailwind CSS, Lucide React icons
- **Database**: SQLite via `better-sqlite3` (WAL mode, foreign keys, parameterized queries)
- **AI Engine**: Vercel AI SDK (`ai` + `@ai-sdk/openai`)
- **PayPal Integration**: `@paypal/agent-toolkit` (import from `@paypal/agent-toolkit/ai-sdk`)
- **Validation**: Zod (100% schema enforcement across all routes)
- **Security**: In-memory sliding-window IP rate limiting, masked logging, strict HTTP security headers

---

## ⚖️ 5. Risk Scoring & Decision Matrix

| Rule Indicator | Points | Rationale |
| :--- | :--- | :--- |
| `invoiceId` provided but NOT found in PayPal Sandbox | **+30** | Spoofed invoice identifier designed to mimic official transactions. |
| No `invoiceId` provided (cannot verify) | **+15** | Direct payment request without backing merchant invoice record. |
| Unknown sender (no prior safe rating in DB) | **+15** | First-time contact with zero verified history. |
| Urgency coercion ("within 24 hours", "act now") | **+15** | Psychological pressure tactics commonly used in phishing. |
| Credential request (OTP, password, PIN, CVV) | **+35** | High-severity credential harvesting attempt. |
| External hyperlink or link shortener | **+15** | Out-of-band links funneling victims away from PayPal portal. |
| High amount: &ge; $1,000 / &ge; $5,000 | **+10 / +20** | Elevated financial exposure. |
| Suspicious instructions (call numbers, gift cards, AnyDesk) | **+25** | Tech-support refund or telephone extortion vector. |
| **CRITICAL OVERRIDE** | **&ge; 85** | If credential request triggered AND unverified invoice, score is immediately clamped to minimum 85. |

### Risk Bands:
- **0 – 54 (`SAFE`)**: Clean invoice. Standard verification advised.
- **55 – 84 (`NEEDS_REVIEW`)**: Elevated anomaly indicators. Exercise caution before authorizing payment.
- **85 – 100 (`QUARANTINE`)**: Critical scam detected. Automatically quarantined to protect funds.

### AI Role:
AI **never** dictates the final score. Final risk scores and risk levels derive **only** from the deterministic rule engine. The AI provides threat categorization, confidence, and natural language explanations. If the AI evaluates risk &ge; 85 on an item rules rated `SAFE`, the safety net elevates it to `NEEDS_REVIEW` (score 55).

---

## 🚀 6. Getting Started & Setup Instructions

### Prerequisites
- Node.js version 18.17.0 or higher (v20 LTS recommended).
- npm or pnpm.

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Use `.env.example` as the variable reference. Gmail monitoring requires a Google OAuth client, a persistent database volume, a private access proxy, and a trusted scheduler. PayPal Sandbox credentials and the OpenAI API key are optional; without them, PayPal verification is unavailable and deterministic rules still run. Never put secrets in `NEXT_PUBLIC_*` variables.

Follow [docs/WEB_PLATFORM.md](./docs/WEB_PLATFORM.md) for Google's Gmail API setup, exact OAuth scope, secret generation, scheduler configuration, and test procedure.

### Step 3: Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the landing page or [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the security console.

---

## 🧪 7. Live Demo & Evaluation Guide

### 1. Interactive Dev Simulation
1. Navigate to `/dashboard`.
2. Locate the **Dev Sandbox Simulator** card (rendered only in development mode).
3. Click **+ Simulate Safe**: Generates a standard retainer invoice classified as **SAFE**.
4. Click **+ Simulate Suspicious**: Generates an urgent domain renewal notice flagged for **NEEDS REVIEW**.
5. Click **+ Simulate Scam Trap**: Generates a Geek Squad telephone callback trap auto-locked into **QUARANTINE**.

### 2. Inspect Threat Reasoning
1. Click **Details** on any card to open the accessible **DetailsModal**.
2. Review the **Why was this flagged?** breakdown detailing matched triggers.
3. Review the safe next steps: official website verification, no phone calls, no OTP sharing.

### 3. User Feedback & Learning Loop
1. Click **Mark as Safe**: Records user feedback in `user_feedback` table, updates sender status, and releases the invoice. Future transactions from this sender benefit from known-sender verification.
2. Click **Report Scam**: Confirms the threat, raises/maintains the risk level to `QUARANTINE`, and logs the attack pattern.

### 4. Interactive Scanner Modal
1. Click **Test AI Scam Scanner** in the top navigation.
2. Select any preset (e.g. Geek Squad, Crypto Escrow, Phishing Harvester) or paste custom text.
3. Click **Run Scam Defense Scan** to test real-time scoring.

---

## 🔒 8. Security Highlights & Best Practices

- **Zero-Secret Client Exposure**: All credentials (`PAYPAL_CLIENT_SECRET`, `OPENAI_API_KEY`, webhook IDs) are isolated with `import "server-only"`.
- **Strict Sandbox Enforcement**: Live PayPal mode is rejected with a fatal error; all network requests target `https://api-m.sandbox.paypal.com`.
- **Fail-Closed Webhook Verification**: Raw payload signature verification prevents forged webhooks.
- **Replay Protection**: Event deduplication prevents replay attacks.
- **Masked Logging**: Automatic redaction of emails, bearer tokens, API keys, and payment card numbers.
- **HTTP Security Headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `HSTS`, `Referrer-Policy`.
- **Injection Defense**: Pure deterministic scoring isolates the application from prompt-injection vulnerabilities.

---

## ⚠️ 9. Known Limitations & Production Readiness

- **Local SQLite Persistence**: PayShield AI uses local SQLite (`better-sqlite3`) with WAL mode for zero-configuration hackathon deployment. For multi-node production deployments, swap `lib/db.ts` to managed PostgreSQL (e.g. Supabase, Neon, AWS RDS).
- **In-Memory Rate Limiting**: The current rate limiter tracks IP addresses in memory. In multi-instance serverless setups, migrate state to Redis (e.g. Upstash).

---

## 🔮 10. Future Scope

- **Automated Two-Way Dispute Resolution**: Automatically initiate sandbox disputes via the PayPal Agent Toolkit when confirmed scams are identified.
- **Multi-Tenant Organization Accounts**: Support team-based security administration with role-based access control (RBAC).
- **Cross-Platform Browser Extension**: Real-time browser companion highlighting deceptive invoices directly inside the PayPal web interface.

---

## 📄 License
This project is licensed under the MIT License.
