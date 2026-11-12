import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const paypal = readFileSync(new URL("lib/paypal.ts", root), "utf8");
const route = readFileSync(new URL("app/api/quarantine/route.ts", root), "utf8");
const database = readFileSync(new URL("lib/db.ts", root), "utf8");

assert.match(paypal, /invoices:\s*\{[\s\S]*?cancel:\s*true/);
assert.ok(paypal.indexOf("tools.get_invoice") < paypal.indexOf("tools.cancel_sent_invoice"));
assert.match(paypal, /if \(status === "DRAFT"\)[\s\S]*?tools\.delete_invoice/);
assert.match(paypal, /status !== "SENT" \|\| !Number\.isFinite\(paidAmount\) \|\| paidAmount !== 0/);
assert.match(paypal, /parsed\.success === true \|\| parsed\.status === 204 \|\| parsed\.statusCode === 204/);
assert.match(route, /getQuarantineCancellationTarget\(paypalItemId\.trim\(\)\)/);
assert.match(route, /cancelPayPalInvoice\(\s*target\.invoiceId/);
assert.match(database, /paypal_action_attempted_at[\s\S]*paypal_action_response[\s\S]*paypal_action_error[\s\S]*paypal_invoice_status/);
assert.match(database, /status = CASE WHEN \? = 1 THEN 'REPORTED_SCAM' ELSE status END/);

console.log("PayPal cancellation source checks passed (9 checks; no API calls made).");