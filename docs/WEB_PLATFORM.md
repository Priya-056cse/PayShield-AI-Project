# PayShield AI web-platform implementation

## What this implementation does

This repository supports one Gmail account on a **single-user deployment protected by a private access proxy**. A trusted external scheduler must call the Gmail history poll route; the app does not run its own background scheduler. New inbox messages are checked for OTP requests, sender/brand impersonation, urgency, risky attachments, payment-scam language, and suspicious URL patterns. OTP-like numeric values are redacted before persistence or optional AI analysis. High-risk messages receive a hidden, reversible `PayShield/Quarantined` label; suspicious messages receive `PayShield/Review`. Messages are not moved or deleted.

The dashboard also provides offline URL pattern checks (no outbound request to the submitted URL), a simulated call-risk analyzer, persistent security events and audit history, and Gmail label restore. The call demo does not connect to telephony or block calls. URL checks do not provide live reputation or browser-level blocking.

The PayPal integration remains Sandbox-only and optional. A PayPal invoice ID is verified against the configured Sandbox account. Without PayPal credentials, the report remains unverified and risk rules still run.

The manual PayPal cancellation action re-fetches the invoice from Sandbox and permits cancellation only when the invoice is `SENT` with zero recorded payment. Draft, paid, partially paid, and already-resolved invoices are not cancelled or deleted.

This is not a mobile or endpoint-monitoring product:

- A web app cannot inspect native calls, SMS, or personal WhatsApp messages. Real call screening requires a native Android `CallScreeningService` or supported telephony provider.
- Gmail attachment names are included in analysis, but attachment bytes are **not downloaded or OCR-scanned**. PDF/image invoice extraction, malware scanning, live link reputation, URL redirect analysis, and domain/SSL reputation are not implemented.
- URL checks parse the submitted URL and compare local patterns only. They do not visit the target, follow redirects, query threat-intelligence services, or block the user's browser.
- Inbox polling runs only when an external scheduler calls the endpoint (recommended: once per minute); it is not instantaneous push delivery.
- A score is a risk signal, not proof of fraud. Do not configure this system to make payments or to cancel invoices automatically.

## Email phishing classifier

Gmail message analysis combines the existing deterministic `analyzeEmailThreat` rules with the versioned TF-IDF classifier in `models/phishing-email-model.v1.json`. The classifier is trained from the public `zefang-liu/phishing-email-dataset`; training, split, threshold selection, held-out test results, dependency versions, and model checksum are recorded in `reports/phishing-email-ml-comparison.md`.

The hybrid can raise an otherwise-safe message to `REVIEW`; only the existing deterministic rules can produce a quarantine-level score. A message classified by the rules as `LEGITIMATE_OTP` is not escalated by the ML score alone. Existing reversible Gmail review/quarantine labels and restoration behavior are unchanged.

To reproduce the experiment, use the dataset CSV cached in the system temporary directory (or set `PAYSHIELD_EMAIL_DATASET` to a local copy), install `requirements-ml.txt`, then run `npm run train:email-model`. The script deduplicates before stratified 70/15/15 splitting, fits only on training data, tunes model thresholds on validation, parity-checks the exported runtime against the held-out test probabilities, and writes the comparison report and versioned artifact. Run `npm run test:email-classifier` for model and OTP regression checks. Benchmark performance is not a guarantee of current or real-world phishing detection.

Run `npm run test:security-workflows` for local checks covering Gmail analyzer wiring, hybrid decision precedence, OTP handling, SQLite event/audit persistence, dashboard aggregates, Sandbox configuration guards, and offline URL/call/invoice rules. These tests do not contact Google or PayPal.

## Local invoice email fixtures (no Gmail account)

Run `npm run test:local-fixtures` to analyze the synthetic examples in `fixtures/invoice-emails.json`. The command invokes the same `analyzeEmailThreat` rules and `applyEmailClassifier` model used by Gmail message processing, and the existing pure invoice `calculateRisk` engine. It prints each email's risk score, risk level, classification, simulated PayPal verification state, and detection reasons. It requires no `.env.local`, Gmail OAuth, PayPal credentials, OpenAI key, running web server, or database.

The dashboard's **Invoice Fraud Detection Demo** section calls `POST /api/demo/invoice` to run the selected fixture through those same local analyzers. Results are returned to the dashboard without database writes or outbound requests. PayPal verification is explicitly mock/simulated.

The fixture invoice IDs and verification states are mock data passed directly to the rule engine; they are not sent to PayPal or treated as genuine sandbox records. The test does not call Gmail, create or send invoices, initiate payments, or persist reports. Thus it validates local classification and invoice scoring, not Gmail message retrieval/label changes, live PayPal verification, AI results, or the database-backed end-to-end workflow. For a live integration test, use separate test accounts and follow the safeguards below.

## Files and responsibilities

```text
app/api/gmail/connect/route.ts       Starts OAuth and sets a short-lived signed-state cookie
app/api/gmail/callback/route.ts      Validates OAuth state, stores encrypted refresh token
app/api/gmail/status/route.ts        Exposes connection status only
app/api/cron/gmail/route.ts          Authenticated scheduled Gmail history poll
lib/gmail.ts                         OAuth, token encryption, Gmail API, analysis, labels
lib/securityAnalyzer.ts              Offline email, OTP, URL, and simulated-call rules
lib/emailClassifier.ts               Versioned TF-IDF inference and review-only hybrid
models/phishing-email-model.v1.json  Versioned scikit-learn export for server inference
lib/analyzeWorkflow.ts               Shared deterministic + optional AI analysis pipeline
lib/db.ts                            SQLite schema, Gmail cursors, security events, threats, and audit log
types/invoice.ts                     Includes GMAIL as an invoice source
components/dashboard/security-console.tsx
                                    Database-backed overview, URL/call demos, quarantine restore, audit activity
.env.example                        Required configuration names and deployment notes
docs/WEB_PLATFORM.md                 This implementation/deployment contract
```

## APIs and models

### Google

- Gmail API `users.getProfile`: account identity and initial history cursor.
- Gmail API `users.labels.list` / `users.labels.create`: create the two hidden PayShield labels.
- Gmail API `users.history.list` with `historyTypes=messageAdded`: find newly received messages.
- Gmail API `users.messages.get?format=full`: read message headers and text MIME parts.
- Gmail API `users.messages.modify`: add the risk label only.
- OAuth 2.0 authorization-code flow and refresh-token grant at Google's OAuth endpoints.
- Requested OAuth scope: `https://www.googleapis.com/auth/gmail.modify`. This scope is needed to apply and restore labels. It permits broader Gmail modification than the app uses; no send/delete API is called. Reconnect Gmail to re-consent if the existing authorization predates this scope.

### PayPal and AI

- `@paypal/agent-toolkit` invoice listing/verification is restricted to `https://api-m.sandbox.paypal.com`; live mode is rejected.
- Existing model: `gpt-4o-mini` through the Vercel AI SDK, optional. The model supplies classification/explanation only. Deterministic rules remain authoritative for score and risk level. If AI is absent or unavailable, rules continue.
- When `OPENAI_API_KEY` is configured, only the existing invoice-analysis path sends its already-redacted message text to OpenAI. The general email, OTP, URL, and call detectors use local deterministic rules and do not send their content to the model.
- Gmail-only monitoring works without PayPal credentials; invoices cannot be PayPal-verified in that configuration.

### Application routes

| Method and route | Purpose |
|---|---|
| `GET /api/gmail/connect` | Starts OAuth; initiate only from the private dashboard |
| `GET /api/gmail/callback` | Google callback; validates signed state cookie |
| `GET /api/gmail/status` | Returns connected/not-connected and account email |
| `GET /api/cron/gmail` | Polls Gmail; requires `Authorization: Bearer <PAYSHIELD_CRON_SECRET>` |
| `GET /api/security/activity` | Reads database-backed metrics, events, and audit history |
| `POST /api/security/url` | Offline URL pattern analysis; never fetches the submitted URL |
| `POST /api/security/calls` | Simulated call-risk analysis; never blocks a phone call |
| `POST /api/security/events/{id}/restore` | Removes PayShield Gmail labels and records the restore |
| `POST /api/analyze` | Existing manual/sandbox invoice analysis endpoint |
| `POST /api/webhooks/paypal` | Existing signed PayPal Sandbox webhook endpoint |

For local development, set `GOOGLE_REDIRECT_URI` and the Google OAuth client's Authorized redirect URI to exactly `http://localhost:3000/api/gmail/callback`. Production must use the exact HTTPS callback URL configured for that deployment.

## Database additions

`lib/db.ts` creates/migrates these tables in the configured SQLite database:

```sql
CREATE TABLE gmail_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  history_id TEXT NOT NULL,
  quarantine_label_id TEXT NOT NULL,
  review_label_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE gmail_processed_messages (
  message_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'ANALYZED', 'DONE', 'ERROR')),
  report_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT,
  risk_score INTEGER NOT NULL,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasons TEXT NOT NULL,
  urls TEXT NOT NULL,
  sender TEXT,
  created_at TEXT NOT NULL
);
```

`security_audit_logs` stores append-only decisions and user restores. `threat_urls` stores suspicious URL indicators without query strings. Gmail message IDs are unique in both processing and event records. OTP-like numeric sequences are redacted from analyzed content, summaries, and stored URL paths. The existing `invoices.source` CHECK constraint is migrated to allow `GMAIL`. Gmail history is advanced only after the entire batch succeeds. Claims older than five minutes may be reclaimed after a crashed invocation.

## Workflow

1. A private user starts `/api/gmail/connect`. Google consent is requested with offline access; OAuth state is random, HMAC-signed, HttpOnly, SameSite=Lax, and short-lived.
2. The callback validates state, exchanges the code, reads the account profile, creates/gets the two labels, AES-256-GCM encrypts the refresh token, and saves the initial history cursor.
3. A trusted scheduler calls `/api/cron/gmail` every minute with the bearer secret. Google access tokens are refreshed server-side.
4. The worker fetches newly added messages in `INBOX`, extracts sender, subject, plain/HTML text, and attachment filenames, and runs deterministic email/OTP/link checks on each message. OTP-like numeric values are redacted before downstream persistence.
5. Invoice/payment messages continue through the existing analysis workflow and PayPal Sandbox verification when configured. Combined severity is stored as a security event and applied as a reversible Gmail label; safe mail remains unchanged. Optional AI analysis is limited to the existing invoice-analysis path.
6. If Gmail history expires, the worker recovers at most 500 messages from the last three days and then resets the cursor. This recovery window is bounded; alert on repeated sync failures and reconnect if access was revoked.

## Permissions and deployment requirements

1. Create a Google Cloud project, enable Gmail API, configure OAuth consent, and create a Web application OAuth client.
2. Add the exact callback URL. Request the scope above and complete Google's production verification/security assessment before using real inboxes. Until then, restrict the OAuth app to configured test users.
3. Deploy behind a private identity-aware proxy/VPN that protects **all pages and `/api/*` routes**, including the callback. Ensure the origin cannot be reached around the proxy. This code is single-tenant and does not implement application login or tenant isolation.
4. Keep a persistent, encrypted-volume SQLite database and a single application instance. Do not use ephemeral serverless disk or multiple writers. Back up the DB and encryption key securely.
5. Set the Google credentials, `GOOGLE_REDIRECT_URI`, 32-byte base64 `PAYSHIELD_TOKEN_ENCRYPTION_KEY`, and two independent high-entropy secrets (`PAYSHIELD_OAUTH_STATE_SECRET`, `PAYSHIELD_CRON_SECRET`). Keep all secrets server-side and out of source control.
6. Schedule `GET /api/cron/gmail` every minute from a trusted scheduler. A configured cron secret alone does not mean a scheduler is active. Do not expose the cron secret in browser code or logs.
7. Keep PayPal mode set to `sandbox`. Configure OpenAI only if AI explanation is wanted.

Example PowerShell commands for generating independent secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the first output for the token encryption key and separate second-command outputs for the OAuth-state and cron secrets. Store them in the hosting provider's secret manager, not in client-visible settings.

## Error behavior and operations

- Invalid OAuth state/code is rejected; provider denial does not save credentials.
- Invalid/missing secrets, token decryption failures, revoked consent, and database failures return generic user-facing errors. Server logs identify the failing operation without returning stack traces or credentials.
- Gmail API reads and label modifications retry transient network/429/5xx failures up to three times with exponential backoff and jitter. OAuth authorization-code exchange is not retried. The scheduled endpoint returns `503` and `Retry-After` on sync failure; the history cursor is not advanced so the scheduler can retry.
- The worker does not claim that it can self-debug or repair revoked consent, invalid secrets, database loss, or proxy misconfiguration. Those require an operator to restore configuration. There is no user-facing raw stack trace.
- Monitor HTTP status for `/api/cron/gmail`, OAuth revocation, expired history recovery, database disk space, and report/label counts. The current SQLite and in-memory rate limiter are not suitable for horizontal scaling.

## Exact validation steps

1. Run `npm run type-check`, `npm run lint`, and `npm run build`.
2. In Google Cloud, use a dedicated test Gmail account and OAuth test-user configuration. Connect once from `/dashboard`; verify the status endpoint reports that test account and that the refresh token is not present in the response or browser storage.
3. Send a test message with an invoice/payment phrase and a harmless suspicious memo. Verify a report/security event appears and only the expected hidden review/quarantine label is added. Confirm the message remains in the inbox and no payment or deletion occurs.
4. Send a benign non-invoice inbox message and a sent message. Verify the inbox message gets a security event while the sent message is ignored; the benign message remains unchanged.
5. Send the same message through a retry/repeated scheduler call. Verify there is one report, one decision label, and no duplicate processing.
6. Test the cron endpoint without a bearer token and with an incorrect token; both must return `401`. Confirm no inbox content appears in the response.
7. Temporarily revoke the Google grant or use invalid credentials. Verify the cron endpoint returns a generic `503`, does not advance history, and later succeeds after reconnection.
8. Test expired history recovery by using a stale cursor in a disposable test DB. Verify bounded recovery and deduplication.
9. Keep production access disabled until the proxy, persistent storage, scheduler, OAuth verification, backups, and monitoring are in place.

These are integration acceptance steps; Gmail and PayPal integrations require test-account credentials and are not exercised by local unit checks.
