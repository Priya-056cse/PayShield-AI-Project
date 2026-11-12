import { NextRequest, NextResponse } from "next/server";
import {
  DatabaseError,
  getQuarantineCancellationTarget,
  updateQuarantineCancellation,
  updateQuarantineStatus,
} from "@/lib/db";
import { ConfigurationError } from "@/lib/env";
import { cancelPayPalInvoice, PayPalCancellationError } from "@/lib/paypal";
import { logger } from "@/lib/logger";

/**
 * Legacy quarantine route migrated to use SQLite state management.
 * Forwards release and dispute events cleanly.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, paypalItemId, note } = body;

    if (typeof action !== "string" || typeof paypalItemId !== "string" || !paypalItemId.trim()) {
      return NextResponse.json(
        { error: "action and paypalItemId are required.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (action === "RELEASE") {
      updateQuarantineStatus(String(paypalItemId), "RELEASED");
      return NextResponse.json({
        success: true,
        action,
        paypalItemId,
        newStatus: "RELEASED",
        message: `Item ${paypalItemId} released from quarantine.`,
      });
    }

    if (action === "CANCEL_INVOICE") {
      const target = getQuarantineCancellationTarget(paypalItemId.trim());
      if (!target) {
        return NextResponse.json(
          { error: "Quarantine item was not found.", code: "QUARANTINE_ITEM_NOT_FOUND" },
          { status: 404 }
        );
      }

      if (target.quarantineStatus === "RELEASED") {
        return NextResponse.json(
          { error: "A released invoice cannot be cancelled from quarantine.", code: "INVOICE_NOT_QUARANTINED" },
          { status: 409 }
        );
      }

      if (!target.invoiceId) {
        return NextResponse.json(
          { error: "No PayPal invoice ID is linked to this quarantine item.", code: "PAYPAL_INVOICE_ID_MISSING" },
          { status: 409 }
        );
      }

      if (target.paypalInvoiceStatus === "CANCELLED" || target.paypalInvoiceStatus === "DELETED") {
        return NextResponse.json(
          { error: "This PayPal invoice has already been resolved.", code: "INVOICE_ALREADY_RESOLVED" },
          { status: 409 }
        );
      }

      const attemptedAt = new Date().toISOString();
      let cancellation;
      try {
        cancellation = await cancelPayPalInvoice(
          target.invoiceId,
          undefined,
          typeof note === "string" ? note.slice(0, 500) : undefined
        );
      } catch (error) {
        const cancellationError = error instanceof PayPalCancellationError ? error : null;
        const errorMessage = error instanceof ConfigurationError
          ? error.message
          : cancellationError?.message || "PayPal cancellation failed.";

        try {
          updateQuarantineCancellation({
            quarantineItemId: target.quarantineItemId,
            attemptedAt,
            completedAt: null,
            response: cancellationError?.response === null || cancellationError?.response === undefined
              ? null
              : safeSerialize(cancellationError.response),
            error: errorMessage,
            invoiceStatus: cancellationError?.invoiceStatus || target.paypalInvoiceStatus,
            succeeded: false,
          });
        } catch {
          logger.error("Failed to record PayPal cancellation failure.", { code: "DATABASE_ERROR" });
          return NextResponse.json(
            { error: "Cancellation failed and its failure details could not be saved.", code: "DATABASE_ERROR" },
            { status: 500 }
          );
        }

        if (error instanceof ConfigurationError) {
          logger.warn("PayPal cancellation configuration is incomplete.");
          return NextResponse.json(
            { error: error.message, code: "CONFIGURATION_ERROR" },
            { status: 503 }
          );
        }

        const code = cancellationError?.code || "PAYPAL_CANCELLATION_FAILED";
        const status = cancellationError?.httpStatus || 502;
        logger.warn("PayPal invoice cancellation failed.", { code });
        return NextResponse.json(
          { error: errorMessage, code },
          { status }
        );
      }

      const completedAt = new Date().toISOString();
      try {
        updateQuarantineCancellation({
          quarantineItemId: target.quarantineItemId,
          attemptedAt,
          completedAt,
          response: safeSerialize(cancellation.response),
          error: null,
          invoiceStatus: cancellation.finalInvoiceStatus,
          succeeded: true,
        });
      } catch {
        logger.error("PayPal confirmed cancellation, but local state could not be updated.", {
          code: "DATABASE_ERROR",
        });
        return NextResponse.json(
          {
            error: "PayPal confirmed the invoice action, but local state could not be updated. Reconcile this item before retrying.",
            code: "DATABASE_ERROR",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action,
        paypalItemId,
        finalInvoiceStatus: cancellation.finalInvoiceStatus,
        completedAt,
        message: cancellation.message,
      });
    }

    if (action === "DISPUTE") {
      updateQuarantineStatus(String(paypalItemId), "REPORTED_SCAM");
      return NextResponse.json({
        success: true,
        action,
        paypalItemId,
        newStatus: "REPORTED_SCAM",
        message: `Item ${paypalItemId} flagged and quarantined.`,
      });
    }

    return NextResponse.json({ error: "Unsupported action.", code: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    if (error instanceof DatabaseError) {
      logger.error("Database operation failed in /api/quarantine.", { code: error.code });
      return NextResponse.json(
        { error: "The quarantine database operation failed.", code: error.code },
        { status: 500 }
      );
    }

    logger.error("Unexpected error in /api/quarantine.", { code: "INTERNAL_ERROR" });
    return NextResponse.json({ error: "Internal server error.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function safeSerialize(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 20000) return serialized;
    return JSON.stringify({ truncated: true, preview: serialized.slice(0, 19800) });
  } catch {
    return "[PayPal response could not be serialized]";
  }
}
