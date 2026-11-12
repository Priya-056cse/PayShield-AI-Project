import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addSecurityAuditLog, saveSecurityEvent } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { analyzeCallThreat } from "@/lib/securityAnalyzer";

export const dynamic = "force-dynamic";

const callSchema = z.object({
  callerName: z.string().trim().max(120).optional(),
  description: z.string().trim().min(1).max(3000),
  transcript: z.string().max(3000).optional(),
  simulated: z.literal(true),
});

export async function POST(request: NextRequest) {
  const rate = rateLimit(`security-call:${getClientIp(request)}`, 20, 60_000);
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many call analyses. Try again shortly.", code: "RATE_LIMIT_EXCEEDED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.resetMs / 1000)) } }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON.", code: "INVALID_JSON" }, { status: 400 });
    }
    const parsed = callSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A simulated call description is required.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const analysis = analyzeCallThreat(parsed.data);
    const event = saveSecurityEvent({
      eventType: "CALL",
      source: "SIMULATED",
      riskScore: analysis.riskScore,
      category: analysis.category,
      action: analysis.riskLevel === "SAFE" ? "SIMULATED_CLEAR" : "SIMULATED_FLAG",
      summary: `Simulated call analysis: ${analysis.category}`,
      reasons: analysis.reasons,
    });
    addSecurityAuditLog(
      event.id,
      "SIMULATED_CALL_ANALYZED",
      "Demo analysis only. No live call, caller-ID lookup, recording, or blocking occurred."
    );

    return NextResponse.json({
      eventId: event.id,
      ...analysis,
      simulated: true,
      blocked: false,
      integration: "A native Android CallScreeningService or supported telephony provider is required for real call blocking.",
    });
  } catch (error) {
    logger.error("Call risk analysis failed.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Call analysis failed.", code: "CALL_ANALYSIS_FAILED" },
      { status: 500 }
    );
  }
}
