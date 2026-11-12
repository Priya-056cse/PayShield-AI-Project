import "server-only";
import { verifyInvoiceExists } from "@/lib/paypal";
import { calculateRisk, scoreToLevel, getRecommendedAction } from "@/lib/riskEngine";
import { analyzeWithAI } from "@/lib/ai";
import {
  saveInvoice,
  saveRiskReport,
  createQuarantineItem,
  isKnownSender,
} from "@/lib/db";
import { logger } from "@/lib/logger";
import { isPayPalConfigured } from "@/lib/env";
import type {
  InvoiceAnalysis,
  InvoiceSource,
  RiskLevel,
} from "@/types/invoice";

export interface RunAnalysisInput {
  content: string;
  invoiceId: string | null;
  sender: string;
  amount: number;
  source: InvoiceSource;
}

/**
 * Shared analysis orchestrator executed by both the API route and the PayPal webhook handler.
 * Combines deterministic rule calculation with AI safety net verification and persists results to SQLite.
 */
export async function runAnalysis(input: RunAnalysisInput): Promise<InvoiceAnalysis> {
  const cleanContent = input.content.slice(0, 5000);
  const cleanSender = input.sender.trim().toLowerCase();
  const cleanInvoiceId = input.invoiceId && input.invoiceId.trim().length > 0 ? input.invoiceId.trim() : null;
  const cleanAmount = Number.isFinite(input.amount) && input.amount >= 0 ? input.amount : 0;

  // 1. Verify invoice existence in PayPal Sandbox if invoiceId provided
  let paypalVerified = false;
  if (cleanInvoiceId && isPayPalConfigured()) {
    const ppResult = await verifyInvoiceExists(cleanInvoiceId);
    paypalVerified = ppResult.verified;
  } else if (cleanInvoiceId) {
    logger.info("PayPal verification is unavailable; analyzing invoice with a fail-closed unverified status.");
  }

  // 2. Query known sender status in user_feedback
  const senderKnown = isKnownSender(cleanSender);

  // 3. Evaluate deterministic rule engine
  const ruleResult = calculateRisk({
    content: cleanContent,
    sender: cleanSender,
    amount: cleanAmount,
    invoiceId: cleanInvoiceId,
    paypalVerified,
    senderKnown,
  });

  // 4. Semantic AI threat assessment via Vercel AI SDK (never throws)
  const aiResult = await analyzeWithAI({
    content: cleanContent,
    sender: cleanSender,
    amount: cleanAmount,
    invoiceId: cleanInvoiceId,
    ruleResult,
  });

  // 5. Combine results strictly according to PROJECT_SPEC.md:
  // Final score and level come ONLY from the rule engine.
  let finalScore = ruleResult.risk_score;
  let finalLevel: RiskLevel = ruleResult.risk_level;

  // AI Safety Net: if AI risk_score >= 85 and rule level is SAFE, upgrade level to NEEDS_REVIEW (score becomes 55).
  // AI alone can NEVER cause QUARANTINE.
  if (aiResult.risk_score >= 85 && ruleResult.risk_level === "SAFE") {
    finalLevel = "NEEDS_REVIEW";
    finalScore = 55;
    logger.info("AI Safety Net triggered: upgraded SAFE transaction to NEEDS_REVIEW (score 55).", {
      sender: cleanSender,
      aiScore: aiResult.risk_score,
    });
  }

  // Merge and deduplicate reasons
  const reasonsSet = new Set<string>(ruleResult.reasons);
  for (const r of aiResult.reasons) {
    if (r && !reasonsSet.has(r)) {
      reasonsSet.add(r);
    }
  }
  const mergedReasons = Array.from(reasonsSet);

  // Determine recommended action wording
  let recommendedAction = aiResult.recommended_action;
  if (!recommendedAction || finalLevel === "QUARANTINE" || finalLevel === "NEEDS_REVIEW") {
    recommendedAction = getRecommendedAction(finalLevel);
  }

  // 6. Persist to SQLite tables
  const storedInvoice = saveInvoice({
    paypal_invoice_id: cleanInvoiceId,
    sender: cleanSender,
    amount: cleanAmount,
    currency: "USD",
    note: cleanContent,
    status: finalLevel,
    source: input.source,
  });

  const report = saveRiskReport({
    invoice_id: cleanInvoiceId,
    sender: cleanSender,
    amount: cleanAmount,
    content: cleanContent,
    risk_score: finalScore,
    risk_level: finalLevel,
    category: aiResult.category,
    reasons: mergedReasons,
    recommended_action: recommendedAction,
    paypal_verified: paypalVerified,
    ai_confidence: aiResult.confidence,
  });

  // If level is QUARANTINE, automatically create a quarantine item
  if (finalLevel === "QUARANTINE") {
    createQuarantineItem({
      risk_report_id: report.id,
      invoice_id: cleanInvoiceId,
      status: "QUARANTINED",
      reason: mergedReasons[0] || "Quarantined due to high-risk scam indicators.",
    });
  }

  // 7. Return exact target response format
  return {
    id: report.id,
    invoice_id: cleanInvoiceId,
    sender: cleanSender,
    amount: cleanAmount,
    paypal_verified: paypalVerified,
    risk_score: finalScore,
    risk_level: finalLevel,
    category: aiResult.category,
    reasons: mergedReasons,
    recommended_action: recommendedAction,
    ai_confidence: aiResult.confidence,
    created_at: report.created_at,
  };
}
