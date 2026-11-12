# PayPal Integration Audit

1. **Imported tools:** `lib/paypal.ts` imports the `PayPalAgentToolkit` class, not named tools. Individual tools are obtained dynamically from `getTools()`.

2. **Enabled configuration:** invoices `create`, `list`, `send`; orders `create`, `get`; disputes `list`, `get`. The toolkit maps `invoices.cancel: true` to `cancel_sent_invoice`, but `cancel` is not enabled.

3. **Called from API routes:** `/api/analyze` and `/api/dev/simulate-invoice` reach `list_invoices.execute` through `runAnalysis` when an invoice ID is supplied. `/api/webhooks/paypal` obtains a toolkit access token and calls PayPal's webhook verification API directly; created/sent invoice events then reach the same analysis path. The quarantine and feedback routes make no PayPal calls.

4. **Configured but not executed by routes:** `create_invoice`, `send_invoice`, `create_order`, `get_order`, `list_disputes`, and `get_dispute`. `create_invoice` and `get_order` have helper implementations, but no API route calls them. The package's `cancel_sent_invoice` is available but disabled and unused.

5. **Cancellation implementation:** `cancelPayPalInvoice` does not call `cancel_sent_invoice` or the Invoicing API. It returns a hardcoded success message.

6. **Sent/unpaid invoices:** No. The stub does not fetch or verify the PayPal invoice or its status, and does not cancel it.

7. **Database ordering:** No PayPal success is checked. The stub performs no database update, while `/api/quarantine` and the feedback route update local quarantine state without contacting PayPal.

8. **Errors:** Existing PayPal helpers log and generally fail closed or return a failure result; webhook verification returns `false`, producing a generic 401. Cancellation is misleading because its stub reports success regardless of PayPal state. `createSafeInvoice` includes the caught error message in its result and should not be exposed without sanitizing.

9. **Webhooks/status sync:** Signature verification is real: it validates required headers and the PayPal certificate URL, then calls PayPal's verification endpoint and requires `SUCCESS`. Status sync is partial: only `PAID` and `REFUNDED` update the local `invoices` row; canceled events and risk-report/quarantine state are not synced. Events are marked processed before asynchronous work, so a processing failure can prevent a retry.

10. **Changes needed for real quarantine cancellation:** Enable `invoices.cancel`; resolve and validate the PayPal invoice ID (not the report/quarantine row ID), retrieve its current PayPal status, and allow cancellation only for an eligible sent/unpaid invoice. Execute `getTools().cancel_sent_invoice` with `invoice_id` and the required cancellation note. Treat only a confirmed successful result (tool success/HTTP 204) as success; log and return a safe failure otherwise. Update local cancellation/quarantine state only after that confirmation, and add tests for eligible, ineligible, PayPal-error, and database-update cases. The toolkit implementation uses `POST /v2/invoicing/invoices/{invoice_id}/cancel`.