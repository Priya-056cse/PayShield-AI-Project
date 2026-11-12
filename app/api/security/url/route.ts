import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addSecurityAuditLog, saveSecurityEvent } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { analyzeUrlThreat } from "@/lib/securityAnalyzer";

export const dynamic = "force-dynamic";

const urlSchema = z.object({
  url: z.string().trim().min(1).max(2048).url(),
});

export async function POST(request: NextRequest) {
  const rate = rateLimit(`security-url:${getClientIp(request)}`, 30, 60_000);
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many URL scans. Try again shortly.", code: "RATE_LIMIT_EXCEEDED" },
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
    const parsed = urlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide a valid HTTP or HTTPS URL.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const inputUrl = new URL(parsed.data.url);
    if ((inputUrl.protocol !== "https:" && inputUrl.protocol !== "http:") || inputUrl.username || inputUrl.password) {
      return NextResponse.json(
        { error: "Only HTTP(S) URLs without embedded credentials can be checked.", code: "UNSUPPORTED_URL" },
        { status: 400 }
      );
    }

    const analysis = analyzeUrlThreat(parsed.data.url);
    const action = analysis.riskLevel === "SAFE" ? "CLEAR_IN_PAYSHIELD" : "FLAGGED_IN_PAYSHIELD";
    const event = saveSecurityEvent({
      eventType: "URL",
      source: "USER_SCAN",
      riskScore: analysis.riskScore,
      category: analysis.category,
      action,
      summary: `Offline URL check for ${new URL(analysis.normalizedUrl).hostname}`,
      reasons: analysis.reasons,
      urls: [analysis.normalizedUrl],
      threatUrls: analysis.threatUrls,
    });
    addSecurityAuditLog(
      event.id,
      "URL_CHECKED",
      analysis.riskLevel === "SAFE"
        ? "Offline pattern checks found no high-risk indicators; no network request was made."
        : "Flagged in PayShield UI only; browser-level blocking is not installed."
    );

    return NextResponse.json({
      eventId: event.id,
      ...analysis,
      flaggedInPayShield: analysis.riskLevel !== "SAFE",
      browserBlocked: false,
      networkLookupPerformed: false,
    });
  } catch (error) {
    logger.error("URL protection analysis failed.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { error: "URL analysis failed.", code: "URL_ANALYSIS_FAILED" },
      { status: 500 }
    );
  }
}
