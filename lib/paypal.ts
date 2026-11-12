import "server-only";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { z } from "zod";
import { ConfigurationError, getPayPalConfig } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isEligibleForInvoiceCancellation } from "@/lib/paypalCancellation";
import type { PayPalInvoice } from "@/types/invoice";

// Hard sandbox guard: Live PayPal mode is strictly forbidden per PROJECT_SPEC.md
const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

let toolkitInstance: PayPalAgentToolkit | null = null;

/**
 * Initializes and caches the PayPalAgentToolkit singleton with sandbox context
 * and actions for invoices, orders, and disputes.
 */
export function getPayPalToolkit(): PayPalAgentToolkit {
  const config = getPayPalConfig();

  if (config.environment !== "sandbox") {
    throw new Error(
      `[PayShield AI] Security Violation: PayPal environment must be "sandbox". Received: "${config.environment}".`
    );
  }

  if (!toolkitInstance) {
    toolkitInstance = new PayPalAgentToolkit({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      configuration: {
        actions: {
          invoices: {
            create: true,
            list: true,
            get: true,
            send: true,
            cancel: true,
            delete: true,
          },
          orders: {
            create: true,
            get: true,
          },
          disputes: {
            list: true,
            get: true,
          },
        },
        context: {
          sandbox: true,
        },
      },
    });
  }

  return toolkitInstance;
}

/**
 * Valid sandbox invoice statuses recognizing an authentic invoice on PayPal.
 */
const VALID_SANDBOX_STATUSES = new Set([
  "DRAFT",
  "SENT",
  "SCHEDULED",
  "PAID",
  "MARKED_AS_PAID",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_PAID",
  "PARTIALLY_REFUNDED",
  "PAYMENT_PENDING",
  "UNPAID",
]);

/**
 * Searches and verifies whether a given invoiceId or invoice number exists in the PayPal sandbox.
 * Returns { found: boolean, invoice: PayPalInvoice | null, verified: boolean }.
 * On API or network errors, fails closed and returns { found: false, invoice: null, verified: false } without throwing.
 */
export async function verifyInvoiceExists(invoiceId: string | null): Promise<{
  found: boolean;
  invoice: PayPalInvoice | null;
  verified: boolean;
}> {
  if (!invoiceId || invoiceId.trim().length === 0) {
    return { found: false, invoice: null, verified: false };
  }

  const cleanId = invoiceId.trim();

  getPayPalConfig();

  try {
    const toolkit = getPayPalToolkit();
    const tools = toolkit.getTools();
    const listInvoicesTool = tools.list_invoices;

    if (!listInvoicesTool) {
      logger.error("list_invoices tool not found on PayPalAgentToolkit.");
      return { found: false, invoice: null, verified: false };
    }

    // Paginate through up to 3 pages (page_size 20) to locate the invoice
    for (let page = 1; page <= 3; page++) {
      const response = await (listInvoicesTool.execute as Function)({
        page,
        page_size: 20,
        total_required: true,
      });

      let items: any[] = [];
      if (typeof response === "string") {
        try {
          const parsed = JSON.parse(response);
          items = parsed.items || parsed.invoices || [];
        } catch {
          items = [];
        }
      } else if (response && typeof response === "object") {
        items = (response as any).items || (response as any).invoices || [];
      }

      for (const item of items) {
        const matchesId = item.id && String(item.id).toLowerCase() === cleanId.toLowerCase();
        const matchesNumber =
          item.detail?.invoice_number &&
          String(item.detail.invoice_number).toLowerCase() === cleanId.toLowerCase();

        if (matchesId || matchesNumber) {
          const status = String(item.status || "").toUpperCase();
          const verified = VALID_SANDBOX_STATUSES.has(status);

          const matchedInvoice: PayPalInvoice = {
            id: item.id,
            status: item.status,
            amount: item.amount,
            detail: item.detail,
            invoicer: item.invoicer,
            primary_recipients: item.primary_recipients,
          };

          return {
            found: true,
            invoice: matchedInvoice,
            verified,
          };
        }
      }

      // If page had fewer than 20 items, we reached the end of list
      if (items.length < 20) break;
    }

    return { found: false, invoice: null, verified: false };
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    logger.warn("PayPal sandbox invoice verification encountered an error:", {
      invoiceId: cleanId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { found: false, invoice: null, verified: false };
  }
}

/**
 * List sandbox invoices using the PayPal Agent Toolkit.
 */
export async function listInvoices(params?: { page?: number; pageSize?: number }): Promise<PayPalInvoice[]> {
  getPayPalConfig();

  try {
    const toolkit = getPayPalToolkit();
    const listInvoicesTool = toolkit.getTools().list_invoices;
    if (!listInvoicesTool) return [];

    const response = await (listInvoicesTool.execute as Function)({
      page: params?.page || 1,
      page_size: params?.pageSize || 20,
      total_required: false,
    });

    let items: any[] = [];
    if (typeof response === "string") {
      try {
        const parsed = JSON.parse(response);
        items = parsed.items || parsed.invoices || [];
      } catch {
        items = [];
      }
    } else if (response && typeof response === "object") {
      items = (response as any).items || (response as any).invoices || [];
    }

    return items.map((item) => ({
      id: item.id,
      status: item.status,
      amount: item.amount,
      detail: item.detail,
      invoicer: item.invoicer,
      primary_recipients: item.primary_recipients,
    }));
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    logger.error("Failed to list PayPal sandbox invoices:", error);
    return [];
  }
}

const createSafeInvoiceSchema = z.object({
  recipientEmail: z.string().email(),
  amount: z.number().positive(),
  currency: z.literal("USD").default("USD"),
  note: z.string().max(1000).optional(),
  itemName: z.string().max(200).default("Security Protected Invoice"),
});

/**
 * Create a validated, safe invoice in PayPal sandbox.
 * Sanitizes input and validates amount > 0 and currency USD.
 */
export async function createSafeInvoice(
  rawInput: z.infer<typeof createSafeInvoiceSchema>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const validated = createSafeInvoiceSchema.parse(rawInput);
    const sanitizedNote = (validated.note || "PayShield AI Sandbox Safe Invoice").replace(/[\u0000-\u001F\u007F]/g, " ");

    const toolkit = getPayPalToolkit();
    const createTool = toolkit.getTools().create_invoice;

    if (!createTool) {
      return { success: false, error: "create_invoice tool not available in toolkit." };
    }

    const payload = {
      currency_code: validated.currency,
      note: sanitizedNote,
      primary_recipients: [
        {
          billing_info: {
            email_address: validated.recipientEmail,
          },
        },
      ],
      items: [
        {
          name: validated.itemName,
          unit_amount: {
            currency_code: validated.currency,
            value: validated.amount.toFixed(2),
          },
          quantity: "1",
        },
      ],
    };

    const result = await (createTool.execute as Function)(payload);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    logger.error("Failed to create safe invoice in PayPal sandbox:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Validation or sandbox API error.",
    };
  }
}

/**
 * Retrieve PayPal order details via the toolkit get_order tool.
 */
export async function getOrderDetails(orderId: string): Promise<any | null> {
  if (!orderId) return null;

  try {
    const toolkit = getPayPalToolkit();
    const getOrderTool = toolkit.getTools().get_order;

    if (!getOrderTool) return null;

    const result = await (getOrderTool.execute as Function)({ id: orderId });
    return typeof result === "string" ? JSON.parse(result) : result;
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    logger.warn("Failed to get PayPal order details:", { orderId, error });
    return null;
  }
}

/**
 * Verify PayPal Webhook Signature against PayPal Sandbox API.
 * Calls POST https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature
 * Fails closed (returns false) on any network error or missing header.
 */
export async function verifyWebhookSignature(
  headersOrParams: Headers | Record<string, any>,
  rawBody?: string
): Promise<boolean> {
  // Support legacy parameter object if provided
  if (headersOrParams && typeof headersOrParams === "object" && "transmissionId" in headersOrParams) {
    const p = headersOrParams as Record<string, any>;
    return verifyWebhookSignature(
      {
        "paypal-transmission-id": p.transmissionId,
        "paypal-transmission-time": p.transmissionTime,
        "paypal-cert-url": p.certUrl,
        "paypal-auth-algo": p.authAlgo,
        "paypal-transmission-sig": p.transmissionSig,
      },
      typeof p.webhookEvent === "string" ? p.webhookEvent : JSON.stringify(p.webhookEvent || {})
    );
  }

  const getHeader = (name: string): string => {
    if (headersOrParams instanceof Headers) {
      return headersOrParams.get(name) || "";
    }
    const rec = headersOrParams as Record<string, any>;
    return String(rec[name] || rec[name.toLowerCase()] || "");
  };

  const transmissionId = getHeader("paypal-transmission-id");
  const transmissionTime = getHeader("paypal-transmission-time");
  const certUrl = getHeader("paypal-cert-url");
  const authAlgo = getHeader("paypal-auth-algo");
  const transmissionSig = getHeader("paypal-transmission-sig");
  const config = getPayPalConfig();
  const webhookId = config.webhookId;

  // Basic validation of required signature headers
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig || !webhookId) {
    logger.warn("Webhook verification failed: missing signature headers or PAYPAL_WEBHOOK_ID.");
    return false;
  }

  // Ensure certUrl points to legitimate PayPal sandbox domain
  try {
    const parsedCertUrl = new URL(certUrl);
    if (
      parsedCertUrl.protocol !== "https:" ||
      !parsedCertUrl.hostname.endsWith(".paypal.com")
    ) {
      logger.warn("Webhook verification failed: untrusted certUrl domain.", { certUrl });
      return false;
    }
  } catch {
    return false;
  }

  let webhookEvent: unknown;
  try {
    webhookEvent = JSON.parse(rawBody || "{}");
  } catch {
    logger.warn("Webhook verification failed: rawBody is not valid JSON.");
    return false;
  }

  try {
    const toolkit = getPayPalToolkit();
    const token = await toolkit.client.getAccessToken();

    const res = await fetch(`${SANDBOX_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        cert_url: certUrl,
        auth_algo: authAlgo,
        transmission_sig: transmissionSig,
        webhook_id: webhookId,
        webhook_event: webhookEvent,
      }),
    });

    if (!res.ok) {
      logger.warn(`PayPal webhook verification endpoint responded with HTTP ${res.status}`);
      return false;
    }

    const data = await res.json();
    return data?.verification_status === "SUCCESS";
  } catch (error) {
    logger.error("Error verifying PayPal webhook signature:", error);
    return false;
  }
}

/**
 * Backward compatibility alias for webhook route before Phase 3 rewrite.
 */
export const verifyPayPalWebhookSignature = verifyWebhookSignature;

export class PayPalCancellationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly invoiceStatus: string | null = null,
    public readonly response: unknown = null,
    public readonly httpStatus: number = 502
  ) {
    super(message);
    this.name = "PayPalCancellationError";
  }
}

function parseToolkitResponse(result: unknown): Record<string, any> {
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return result && typeof result === "object" ? result as Record<string, any> : {};
}

function confirmedPayPalSuccess(result: unknown): boolean {
  const parsed = parseToolkitResponse(result);
  return parsed.success === true || parsed.status === 204 || parsed.statusCode === 204;
}

function getPayPalErrorDetails(error: unknown): { status: number | null; response: unknown } {
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  const statusValue = candidate?.response?.status ?? candidate?.status ?? candidate?.statusCode;
  const status = Number.isInteger(Number(statusValue)) ? Number(statusValue) : null;

  return {
    status,
    response: candidate?.response?.data ?? null,
  };
}

/**
 * Cancels only a SENT sandbox invoice with no recorded payment.
 * The invoice ID must be the PayPal ID resolved from the local quarantine record.
 */
export async function cancelPayPalInvoice(
  invoiceId: string,
  _subject?: string,
  note?: string
): Promise<{
  success: true;
  invoiceId: string;
  finalInvoiceStatus: "CANCELLED";
  response: unknown;
  message: string;
}> {
  const cleanInvoiceId = typeof invoiceId === "string" ? invoiceId.trim() : "";
  if (!cleanInvoiceId || cleanInvoiceId.length > 127) {
    throw new PayPalCancellationError(
      "INVALID_INVOICE_ID",
      "A valid PayPal invoice ID is required.",
      null,
      null,
      400
    );
  }

  const toolkit = getPayPalToolkit();
  const tools = toolkit.getTools();
  const getInvoiceTool = tools.get_invoice;
  if (!getInvoiceTool) {
    throw new PayPalCancellationError(
      "PAYPAL_TOOL_UNAVAILABLE",
      "PayPal invoice lookup is unavailable.",
      null,
      null,
      503
    );
  }

  let invoice: Record<string, any>;
  try {
    const lookupResult = parseToolkitResponse(
      await (getInvoiceTool.execute as Function)({ invoice_id: cleanInvoiceId })
    );
    invoice = lookupResult.invoice && typeof lookupResult.invoice === "object"
      ? lookupResult.invoice
      : lookupResult;
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    const details = getPayPalErrorDetails(error);
    if (details.status === 404) {
      throw new PayPalCancellationError(
        "PAYPAL_INVOICE_NOT_FOUND",
        "The linked PayPal invoice ID was not found.",
        null,
        details.response,
        404
      );
    }
    throw new PayPalCancellationError(
      "PAYPAL_LOOKUP_FAILED",
      "PayPal could not retrieve the invoice status.",
      null,
      details.response,
      502
    );
  }

  const status = String(invoice.status || "").toUpperCase();

  const paidAmountValue =
    invoice.payments?.paid_amount?.value ??
    invoice.payments?.paid_amount ??
    invoice.amount_paid?.value ??
    invoice.amount_paid ??
    0;
  const paidAmount = Number(paidAmountValue);

  if (!isEligibleForInvoiceCancellation(status, paidAmount)) {
    throw new PayPalCancellationError(
      "INVOICE_NOT_ELIGIBLE",
      "Only a SENT invoice with no recorded payment can be cancelled.",
      status || null,
      null,
      409
    );
  }

  const cancelTool = tools.cancel_sent_invoice;
  if (!cancelTool) {
    throw new PayPalCancellationError(
      "PAYPAL_TOOL_UNAVAILABLE",
      "PayPal invoice cancellation is unavailable.",
      status,
      null,
      503
    );
  }

  const cancellationNote = (note || "Cancelled after quarantine review.")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 500);

  try {
    const response = await (cancelTool.execute as Function)({
      invoice_id: cleanInvoiceId,
      note: cancellationNote || "Cancelled after quarantine review.",
    });

    if (!confirmedPayPalSuccess(response)) {
      throw new PayPalCancellationError(
        "PAYPAL_CANCEL_UNCONFIRMED",
        "PayPal did not confirm invoice cancellation.",
        status,
        response,
        502
      );
    }

    return {
      success: true,
      invoiceId: cleanInvoiceId,
      finalInvoiceStatus: "CANCELLED",
      response,
      message: "Invoice cancelled in PayPal Sandbox.",
    };
  } catch (error) {
    if (error instanceof ConfigurationError || error instanceof PayPalCancellationError) throw error;
    const details = getPayPalErrorDetails(error);
    throw new PayPalCancellationError(
      "PAYPAL_CANCEL_FAILED",
      "PayPal failed to cancel the invoice.",
      status,
      details.response,
      502
    );
  }
}
