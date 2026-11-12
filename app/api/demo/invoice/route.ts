import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fixturesData from "@/fixtures/invoice-emails.json";
import { analyzeEmailThreat } from "@/lib/securityAnalyzer";
import { applyEmailClassifier } from "@/lib/emailClassifier";
import { calculateRisk } from "@/lib/riskEngine";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  fixtureId: z.enum(["genuine-invoice", "fraudulent-invoice"]),
});

type Fixture = (typeof fixturesData.fixtures)[number];

function findFixture(fixtureId: Fixture["id"]): Fixture {
  const fixture = fixturesData.fixtures.find((item) => item.id === fixtureId);
  if (!fixture) throw new Error("Requested invoice demo fixture is missing.");
  return fixture;
}

function classificationForScore(score: number): "SAFE" | "REVIEW" | "QUARANTINE" {
  if (score >= 85) return "QUARANTINE";
  if (score >= 55) return "REVIEW";
  return "SAFE";
}

export async function POST(request: NextRequest) {
  const rate = rateLimit(`invoice-demo:${getClientIp(request)}`, 30, 60_000);
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many demo requests. Try again shortly.", code: "RATE_LIMIT_EXCEEDED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.resetMs / 1000)) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid invoice demo fixture.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const fixture = findFixture(parsed.data.fixtureId);
    const ruleAnalysis = analyzeEmailThreat({
      sender: fixture.sender,
      senderName: fixture.senderName,
      subject: fixture.subject,
      content: fixture.content,
    });
    const emailAnalysis = applyEmailClassifier(
      `${fixture.subject}\n${fixture.content}`.slice(0, 12000),
      ruleAnalysis
    );
    const invoiceAnalysis = calculateRisk({
      content: ruleAnalysis.redactedContent,
      sender: fixture.sender,
      amount: fixture.mockInvoice.amount,
      invoiceId: fixture.mockInvoice.id,
      paypalVerified: fixture.mockInvoice.paypalVerified,
      senderKnown: fixture.mockInvoice.senderKnown,
    });
    const overallRiskScore = Math.max(emailAnalysis.riskScore, invoiceAnalysis.risk_score);
    const reasons = Array.from(new Set([
      ...emailAnalysis.reasons,
      ...invoiceAnalysis.reasons,
    ]));

    return NextResponse.json({
      fixtureId: fixture.id,
      emailRiskScore: emailAnalysis.riskScore,
      emailRiskLevel: emailAnalysis.riskLevel,
      emailCategory: emailAnalysis.category,
      invoiceRiskScore: invoiceAnalysis.risk_score,
      paypalVerification: {
        status: fixture.mockInvoice.paypalVerified ? "MOCK VERIFIED" : "MOCK UNVERIFIED",
        invoiceId: fixture.mockInvoice.id,
      },
      overallRiskScore,
      finalClassification: classificationForScore(overallRiskScore),
      reasons: {
        email: emailAnalysis.reasons,
        invoice: invoiceAnalysis.reasons,
        combined: reasons,
      },
      simulated: true,
    });
  } catch (error) {
    logger.error("Invoice fraud demo analysis failed.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Invoice demo analysis failed.", code: "INVOICE_DEMO_FAILED" },
      { status: 500 }
    );
  }
}
