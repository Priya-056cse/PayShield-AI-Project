import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAnalysis } from "@/lib/analyzeWorkflow";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { ConfigurationError } from "@/lib/env";

const analyzeSchema = z.object({
  content: z
    .string({ required_error: "Field 'content' is required." })
    .min(1, "Field 'content' cannot be empty.")
    .max(5000, "Field 'content' exceeds maximum allowed length of 5000 characters."),
  invoiceId: z
    .string()
    .max(100, "Invoice ID is too long.")
    .nullable()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : null)),
  sender: z
    .string({ required_error: "Field 'sender' is required." })
    .min(1, "Field 'sender' cannot be empty.")
    .max(200, "Field 'sender' exceeds maximum allowed length of 200 characters."),
  amount: z
    .number({ required_error: "Field 'amount' is required." })
    .nonnegative("Field 'amount' must be a non-negative number.")
    .finite("Field 'amount' must be a valid finite number."),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Content-Type Check (enforce application/json)
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Unsupported media type. Content-Type must be application/json.", code: "UNSUPPORTED_MEDIA_TYPE" },
        { status: 415 }
      );
    }

    // 2. IP Rate Limiting (10 requests/minute per IP)
    const clientIp = getClientIp(req);
    const rateCheck = rateLimit(`analyze:${clientIp}`, 10, 60 * 1000);

    if (!rateCheck.success) {
      const retryAfterSeconds = Math.ceil(rateCheck.resetMs / 1000);
      return NextResponse.json(
        {
          error: "Too many analysis requests. Please try again later.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
          },
        }
      );
    }

    // 3. Body Parsing and Payload Size Guard
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON syntax in request body.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    // 4. Schema Validation with Zod
    const validation = analyzeSchema.safeParse(rawBody);
    if (!validation.success) {
      const issues = validation.error.errors.map((e) => e.message).join(" ");
      return NextResponse.json(
        { error: issues, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { content, invoiceId, sender, amount } = validation.data;

    // 5. Execute Analysis Workflow
    const result = await runAnalysis({
      content,
      invoiceId,
      sender,
      amount,
      source: "API",
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("Unhandled error in POST /api/analyze:", error);
    if (error instanceof ConfigurationError) {
      return NextResponse.json(
        { error: error.message, code: "CONFIGURATION_ERROR" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while analyzing the transaction.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
