# PayShield AI Hackathon Readiness

Audit date: 2026-11-11

## Executive summary

The hybrid email analyzer is wired into Gmail message processing: deterministic email rules run first, then the versioned TF-IDF model may raise an otherwise-safe message to review. The combined result is persisted as a security event before Gmail labels are applied. Deterministic quarantine remains authoritative, and legitimate OTP notifications are exempt from model-only escalation.

Local focused tests, TypeScript, lint, and the production build pass. No Google/Gmail or PayPal provider requests were made for this audit. OAuth, mailbox labeling/restoration, sandbox invoice lookup, webhook verification, and scheduled polling therefore remain externally unverified. Do not present them as live-tested.

## Feature status

| Feature | Status | Audit evidence / boundary |
|---|---|---|
| Gmail hybrid analysis path | Implemented; locally verified, provider unverified | `processMessage` calls `analyzeEmailThreat`, then `applyEmailClassifier`, then persists the combined event and applies the resulting label. Wiring is covered by a local source-contract test. No Gmail account was accessed. |
| ML review event persistence | Implemented; locally tested | The model-only result is score 55/category `ML_PHISHING`/review; SQLite tests verify event category, score, action, audit entry, and dashboard aggregation in a temporary database. |
| Deterministic quarantine precedence | Implemented; locally tested | Rule results at quarantine level are retained; the classifier does not lower them. Rule-triggered OTP theft remains quarantined in the fixture. Model-only escalation is review-only. |
| Legitimate OTP handling | Implemented; locally tested | `LEGITIMATE_OTP` prevents model-only escalation. The test OTP notification remains safe; an explicit OTP-theft fixture remains flagged. This is a regression fixture, not a population-wide guarantee. |
| Production model loading | Implemented; locally/build verified | The versioned JSON artifact is imported by the server classifier; the production build completed. Model SHA-256: `b96c7932f489d68fa96a9d58017f9b603048d2c6bb6cf423db0f1c9d1c221cfe`. |
| Gmail OAuth | Implemented; externally unverified | Signed OAuth state, modify scope, encrypted refresh-token storage, and status route are present. No consent, token exchange, or account status was verified against Google. |
| Gmail inbox polling and labels | Implemented; externally unverified | History polling and reversible Review/Quarantined labels are wired. A trusted external scheduler must call the bearer-authenticated cron route. No inbox was read, labeled, or restored. |
| PayPal Sandbox invoice verification | Implemented; externally unverified | Toolkit is guarded to Sandbox; invoice analysis calls `verifyInvoiceExists` when credentials are configured and otherwise fails closed as unverified. The lookup scans at most 3 pages of 20 invoices. No PayPal credentials/account or API was tested. |
| PayPal webhook verification | Implemented; externally unverified | The webhook route checks signatures through PayPal Sandbox and deduplicates event IDs. No signed webhook was submitted. |
| URL analysis | Implemented; offline rules tested | Checks syntax, shorteners, punycode, and lookalike domains locally. It does not visit the URL, query reputation services, or block the browser. |
| SMS analysis | Not implemented | No SMS analyzer or SMS API route exists. OTP checks apply to analyzed email text; this web app cannot inspect native SMS. |
| Call analysis | Simulated; local rules tested | The call endpoint requires `simulated: true`; it analyzes supplied text only and cannot look up callers, intercept, or block calls. |
| Security persistence and audit log | Implemented; local SQLite workflow tested | Security event and audit rows were written/read in a temporary database. Deployment database persistence and live Gmail event lifecycle were not exercised. |
| Dashboard metrics | Implemented; local aggregation tested | Aggregate counts are computed from persisted events. The activity API returns only the latest 20 events and 20 audit entries. The quarantine metric counts historical `GMAIL_QUARANTINED` audit actions, including events later restored. |
| Production build | Passed | `npm run build` compiled and generated the application routes, including Gmail and security APIs. |

## Completed features and tests

- Gmail message analysis has the expected rules → hybrid model → persisted event → label sequence.
- ML-only detections are persisted as review-level events; tests verify event/audit persistence and aggregate metrics without touching the application database.
- Existing deterministic quarantine results are preserved.
- Local rule tests cover OTP handling, suspicious URLs, simulated calls, and invoice risk decisions.
- PayPal configuration rejects a non-Sandbox environment in a local test; this does not prove PayPal connectivity.
- `npm run test:email-classifier` — passed.
- `npm run test:security-workflows` — passed.
- `npm run type-check` — passed.
- `npm run lint` — passed with no warnings or errors.
- `npm run build` — passed.
- Failed final tests: none. External integrations were intentionally not called, so their live status is unknown rather than passed.

The ML benchmark report records 98.06% accuracy, 96.13% precision, 98.78% recall, and 97.44% F1 on its held-out dataset split. Those measurements are dataset-specific and are not live Gmail results or a guarantee of production performance.

## Unverified integrations

- Google consent, refresh token, real Gmail message retrieval, label application, label restoration, and OAuth revocation/reconnection.
- A production scheduler calling `/api/cron/gmail`; the repository provides the endpoint, not the scheduler.
- PayPal Sandbox credentials, invoice lookup result, webhook signature verification, and invoice-analysis persistence against a real Sandbox account.
- Persistent writable SQLite storage in the deployment environment.
- Production access proxy/authentication and secret configuration.

No real Gmail mailbox was accessed or changed. No email was sent. No PayPal invoice was created, sent, cancelled, or paid. No live API result is claimed.

## Known limitations and recommendations

1. Use a disposable Gmail test account and a private access proxy. The requested `gmail.modify` scope is broad; the app currently uses it for labels only.
2. Keep the Gmail scheduler external and trusted. Polling is not push/instant delivery, and the status route only reports configured connection details.
3. Keep PayPal mode Sandbox-only. The toolkit currently exposes invoice create/send/cancel/delete and order-create actions in addition to lookup; the audit did not invoke them. Disable unused mutating actions before deployment if they are not required.
4. PayPal invoice verification examines only the first 60 list results; a valid older invoice may be reported unverified.
5. URL checks are offline heuristics, not threat-intelligence or browser protection. Call handling is only a simulation. SMS monitoring is absent.
6. Gmail attachment names may inform analysis, but attachment bytes are not downloaded, malware-scanned, or OCR-processed.
7. Dashboard event and audit feeds show the latest 20 entries. Quarantine count is cumulative activity, not the number of items currently labeled.
8. Treat ML scores as review signals. The held-out benchmark uses a single public dataset split; dataset drift and false positives remain possible.

## Exact manual testing steps

The following provider steps were **not run** in this audit. Perform them only with explicit authorization and controlled test accounts. Never use a personal Gmail account without its owner's explicit authorization.

### Local checks

From the repository root:

```powershell
npm run test:email-classifier
npm run test:security-workflows
npm run type-check
npm run lint
npm run build
```

### Gmail test account (requires explicit authorization)

1. Create/use a dedicated test Google account and configure OAuth credentials, HTTPS/localhost callback URI, encryption key, state secret, and cron secret using `.env.example` as the variable-name reference. Do not paste secrets into logs or reports.
2. Start the app with `npm run dev`. Open `http://localhost:3000/api/gmail/status`; expect `{"connected":false}` before consent.
3. Open `http://localhost:3000/api/gmail/connect` and complete consent only for the test account. Confirm the dashboard shows the connected test address and `/api/gmail/status` reports it.
4. Put controlled safe-OTP, explicit-OTP-theft, and model-only review fixtures in that test inbox. Invoke the poller:

   ```powershell
   curl.exe -i -H "Authorization: Bearer <PAYSHIELD_CRON_SECRET>" http://localhost:3000/api/cron/gmail
   ```

5. Confirm the safe OTP receives no PayShield label, rule-quarantine mail gets `PayShield/Quarantined`, and model-only mail gets `PayShield/Review`. Inspect `/api/security/activity` for `ML_PHISHING`, `REVIEW`, and matching audit entries.
6. Restore a labeled test message using its event ID:

   ```powershell
   curl.exe -i -X POST http://localhost:3000/api/security/events/<EVENT_ID>/restore
   ```

   Confirm the PayShield labels are removed and the event action becomes `RESTORED`. These steps modify labels on the test mailbox; do not run them against a real mailbox without explicit authorization.

### PayPal Sandbox (read-only invoice lookup)

1. Configure Sandbox client credentials and `PAYPAL_ENVIRONMENT=sandbox`; use an already-existing Sandbox invoice ID. Do not create an invoice or make a payment.
2. Submit an invoice-analysis request using that ID:

   ```powershell
   curl.exe -i -X POST http://localhost:3000/api/analyze `
     -H "Content-Type: application/json" `
     -d '{"content":"Sandbox invoice review","invoiceId":"<EXISTING_SANDBOX_INVOICE_ID>","sender":"test@example.invalid","amount":25}'
   ```

3. Confirm `paypal_verified` reflects the Sandbox lookup and inspect the persisted report. Repeat with an unknown ID and confirm it is treated as unverified. These checks are provider tests only when executed against actual Sandbox credentials; they are not part of this audit's passed tests.

### Offline URL, call, and dashboard checks

```powershell
curl.exe -i -X POST http://localhost:3000/api/security/url `
  -H "Content-Type: application/json" `
  -d '{"url":"https://paypal-login.example.invalid/verify"}'

curl.exe -i -X POST http://localhost:3000/api/security/calls `
  -H "Content-Type: application/json" `
  -d '{"callerName":"PayPal support","description":"Caller asks for an OTP","simulated":true}'

curl.exe -i http://localhost:3000/api/security/activity
```

The URL check is offline and should not visit the supplied host. The call request is explicitly simulated; `blocked` remains false. Use the activity response to inspect aggregate counts, persisted events, and recent audit entries.

## Final submission recommendations

- Describe Gmail and PayPal as implemented but **not live-verified** until the controlled manual checks are completed.
- Demo URL and call analysis as offline/simulated functionality; do not claim SMS or real call protection.
- Demonstrate ML as a review-only aid with the benchmark report and OTP safeguard, not as guaranteed detection.
- Do not use any PayPal mutating toolkit action during the demo. Restrict unused create/send/cancel/delete capabilities before a production deployment.
- Keep all API routes behind authenticated private access, configure persistent database storage, and verify scheduler health.
