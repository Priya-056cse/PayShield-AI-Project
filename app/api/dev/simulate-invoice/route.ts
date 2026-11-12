import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAnalysis } from "@/lib/analyzeWorkflow";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { ConfigurationError } from "@/lib/env";

const simulateSchema = z.object({
  scenario: z.enum(["safe", "suspicious", "scam"], {
    errorMap: () => ({ message: "Field 'scenario' must be one of: 'safe', 'suspicious', 'scam'." }),
  }),
});

/**
 * Dev-only simulation endpoint.
 * Returns 404 in production mode per PROJECT_SPEC.md.
 */
export async function POST(req: NextRequest) {
  // 1. Strict production guard
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Endpoint not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  try {
    // 2. Light rate limit for dev endpoint (30 req/min)
    const clientIp = getClientIp(req);
    const rateCheck = rateLimit(`sim:${clientIp}`, 30, 60 * 1000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { error: "Too many simulation requests.", code: "RATE_LIMIT_EXCEEDED" },
        { status: 429 }
      );
    }

    // 3. Validate body
    let rawBody: unknown = {};
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON format in body.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const validation = simulateSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || "Invalid scenario.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { scenario } = validation.data;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);

    let content: string;
    let sender: string;
    let amount: number;
    let invoiceId: string;

    switch (scenario) {
      case "safe":
        content = "Web Development & Maintenance Services - Monthly Retainer. Thank you for your partnership.";
        sender = "billing@trusted-vendor.com";
        amount = 150.0;
        invoiceId = `INV-SAFE-${randomSuffix}`;
        break;

      case "suspicious":
        content =
          "Urgent: Final notice regarding pending domain service renewal. Please verify transaction details immediately at https://secure-domain-review.org to prevent service disruption.";
        sender = "billing-alerts@domain-services-notice.com";
        amount = 49.99;
        invoiceId = `INV-SUSP-${randomSuffix}`;
        break;

      case "scam":
      default:
        content =
          "INVOICE NOTICE: Geek Squad 3-Year Protection Auto-Renewed for $599.99. If unauthorized, call our cancellation helpline immediately at +1-800-555-0199 within 24 hours. You must share your one-time password OTP with the agent to authorize refund.";
        sender = "geeksquad-billing-dept992@gmail.com";
        amount = 599.99;
        invoiceId = `INV-SCAM-${randomSuffix}`;
        break;
    }

    logger.info(`Running simulation scenario: ${scenario} for ${invoiceId}`);

    const result = await runAnalysis({
      content,
      invoiceId,
      sender,
      amount,
      source: "SIMULATED",
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("Error in POST /api/dev/simulate-invoice:", error);
    if (error instanceof ConfigurationError) {
      return NextResponse.json(
        { error: error.message, code: "CONFIGURATION_ERROR" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to simulate invoice scenario.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
