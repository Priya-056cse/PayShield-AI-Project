import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { runAnalysis } from "@/lib/analyzeWorkflow";
import { markWebhookEventProcessed, getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ConfigurationError } from "@/lib/env";

const DEV_SIMULATOR_SECRET = process.env.PAYSHIELD_DEV_SECRET;

/**
 * Handle incoming PayPal Sandbox Webhooks.
 * Validates signatures, prevents duplicate replay attacks, and processes invoices asynchronously.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Read RAW body before parsing
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return NextResponse.json(
        { error: "Failed to read webhook payload stream.", code: "PAYLOAD_READ_ERROR" },
        { status: 400 }
      );
    }

    if (!rawBody || rawBody.trim().length === 0) {
      return NextResponse.json(
        { error: "Webhook body is empty.", code: "EMPTY_PAYLOAD" },
        { status: 400 }
      );
    }

    // 2. Signature verification
    const isDevSimulator =
      process.env.NODE_ENV === "development" &&
      Boolean(DEV_SIMULATOR_SECRET) &&
      req.headers.get("x-payshield-dev-simulator") === DEV_SIMULATOR_SECRET;

    if (!isDevSimulator) {
      const isValid = await verifyWebhookSignature(req.headers, rawBody);
      if (!isValid) {
        logger.warn("PayPal webhook signature verification failed; rejecting with 401.");
        return NextResponse.json(
          { error: "Invalid webhook signature.", code: "INVALID_SIGNATURE" },
          { status: 401 }
        );
      }
    }

    // 3. Parse JSON safely
    let event: Record<string, any>;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON format in webhook body.", code: "MALFORMED_JSON" },
        { status: 400 }
      );
    }

    const eventId = String(event.id || "");
    const eventType = String(event.event_type || "");

    if (!eventId || !eventType) {
      return NextResponse.json(
        { error: "Missing event id or event_type.", code: "INVALID_EVENT" },
        { status: 400 }
      );
    }

    // 4. Duplicate Event Deduplication
    const isNew = markWebhookEventProcessed(eventId);
    if (!isNew) {
      logger.info(`Webhook event ${eventId} has already been processed. Ignoring duplicate.`);
      return NextResponse.json({ received: true, status: "DUPLICATE_IGNORED" }, { status: 200 });
    }

    // 5. Filter for supported events
    const supportedEvents = [
      "INVOICING.INVOICE.CREATED",
      "INVOICING.INVOICE.SENT",
      "INVOICING.INVOICE.PAID",
      "INVOICING.INVOICE.REFUNDED",
    ];

    if (!supportedEvents.includes(eventType)) {
      return NextResponse.json(
        { received: true, status: "EVENT_TYPE_IGNORED", event_type: eventType },
        { status: 200 }
      );
    }

    // 6. Return 200 OK immediately and process asynchronously (fire-and-forget)
    (async () => {
      try {
        const resource = event.resource || {};

        if (eventType === "INVOICING.INVOICE.CREATED" || eventType === "INVOICING.INVOICE.SENT") {
          // Extract invoice ID
          const invoiceId = String(resource.id || resource.invoice_id || "").trim() || null;

          // Extract sender / invoicer email
          const invoicer = resource.invoicer || {};
          const sender = String(
            invoicer.email_address ||
            resource.primary_recipients?.[0]?.billing_info?.email_address ||
            "unverified-merchant@sandbox.paypal.com"
          ).trim();

          // Extract amount
          let amount = 0;
          if (resource.amount?.value) {
            amount = Number(resource.amount.value) || 0;
          } else if (Array.isArray(resource.items) && resource.items.length > 0) {
            amount = Number(resource.items[0]?.unit_amount?.value) || 0;
          }

          // Extract memo/note
          const detail = resource.detail || {};
          const note =
            detail.memo ||
            detail.note ||
            resource.memo ||
            resource.note ||
            (Array.isArray(resource.items)
              ? resource.items.map((i: any) => `${i.name || ""} ${i.description || ""}`).join(" ")
              : "") ||
            "Incoming PayPal Invoice";

          logger.info(`Processing async webhook for invoice: ${invoiceId || "unspecified"}`);

          await runAnalysis({
            content: String(note),
            invoiceId,
            sender,
            amount,
            source: "WEBHOOK",
          });
        } else if (eventType === "INVOICING.INVOICE.PAID" || eventType === "INVOICING.INVOICE.REFUNDED") {
          const invoiceId = String(resource.id || resource.invoice_id || "").trim();
          const newStatus = eventType === "INVOICING.INVOICE.PAID" ? "PAID" : "REFUNDED";

          if (invoiceId) {
            const db = getDb();
            const stmt = db.prepare(`UPDATE invoices SET status = ? WHERE paypal_invoice_id = ?`);
            stmt.run(newStatus, invoiceId);
            logger.info(`Updated stored invoice ${invoiceId} status to ${newStatus}`);
          }
        }
      } catch (asyncErr) {
        logger.error("Error processing asynchronous webhook task:", asyncErr);
      }
    })();

    return NextResponse.json({ received: true, status: "PROCESSING_ASYNC" }, { status: 200 });
  } catch (error) {
    logger.error("Unhandled error in PayPal webhook handler:", error);
    if (error instanceof ConfigurationError) {
      return NextResponse.json(
        { error: error.message, code: "CONFIGURATION_ERROR" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Webhook processing encountered an error.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}