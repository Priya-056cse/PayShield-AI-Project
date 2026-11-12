/**
 * PayShield AI - Deterministic Rule Engine
 * Pure, deterministic functions calculating risk scores and levels per PROJECT_SPEC.md.
 * No I/O, no DB/AI/PayPal dependencies.
 */

import type { RiskLevel, RuleEvaluation, RuleEngineResult } from "@/types/invoice";

// RULE WEIGHTS (Exported constants matching PROJECT_SPEC.md exactly)
export const WEIGHT_INVOICE_NOT_FOUND = 30;
export const WEIGHT_NO_INVOICE_ID = 15;
export const WEIGHT_UNKNOWN_SENDER = 15;
export const WEIGHT_URGENCY = 15;
export const WEIGHT_CREDENTIAL_REQUEST = 35;
export const WEIGHT_EXTERNAL_LINK = 15;
export const WEIGHT_HIGH_AMOUNT_MID = 10; // >= 1000
export const WEIGHT_HIGH_AMOUNT_HIGH = 20; // >= 5000
export const WEIGHT_SUSPICIOUS_INSTRUCTIONS = 25;

// RISK SCORE BANDS
export const BAND_SAFE_MAX = 54;
export const BAND_NEEDS_REVIEW_MIN = 55;
export const BAND_NEEDS_REVIEW_MAX = 84;
export const BAND_QUARANTINE_MIN = 85;

export interface RiskEngineInput {
  content: string;
  sender: string;
  amount: number;
  invoiceId: string | null;
  paypalVerified: boolean;
  senderKnown: boolean;
}

/**
 * Normalize input string: lowercase and collapse whitespace.
 */
export function normalizeText(text: string): string {
  if (!text) return "";
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Rule: PayPal verification status.
 * +30 if invoiceId provided but NOT found in sandbox.
 * +15 if no invoiceId provided (cannot verify).
 */
export function checkPayPalVerification(
  invoiceId: string | null,
  paypalVerified: boolean
): RuleEvaluation {
  const hasId = Boolean(invoiceId && invoiceId.trim().length > 0);

  if (hasId && !paypalVerified) {
    return {
      rule_id: "INVOICE_NOT_FOUND",
      triggered: true,
      points: WEIGHT_INVOICE_NOT_FOUND,
      reason: `Invoice ID provided (${invoiceId}) was not found or verified in PayPal sandbox.`,
    };
  }

  if (!hasId) {
    return {
      rule_id: "NO_INVOICE_ID",
      triggered: true,
      points: WEIGHT_NO_INVOICE_ID,
      reason: "No PayPal invoice ID provided; unable to verify against PayPal sandbox records.",
    };
  }

  return {
    rule_id: "PAYPAL_VERIFIED",
    triggered: false,
    points: 0,
    reason: "Invoice ID verified against PayPal sandbox.",
  };
}

/**
 * Rule: Unknown sender.
 * +15 if no prior MARK_SAFE feedback for this sender.
 */
export function checkUnknownSender(senderKnown: boolean): RuleEvaluation {
  if (!senderKnown) {
    return {
      rule_id: "UNKNOWN_SENDER",
      triggered: true,
      points: WEIGHT_UNKNOWN_SENDER,
      reason: "Unknown sender with no prior verified history or safe rating.",
    };
  }

  return {
    rule_id: "KNOWN_SENDER",
    triggered: false,
    points: 0,
    reason: "Sender has been previously verified or marked safe.",
  };
}

/**
 * Rule: Urgency language.
 * +15 if urgent coercion phrases are present.
 */
export const URGENCY_PATTERNS = [
  /\burgent\b/i,
  /\bimmediately\b/i,
  /\bwithin 24 hours\b/i,
  /\bfinal notice\b/i,
  /\baccount suspended\b/i,
  /\bact now\b/i,
  /\btime[- ]sensitive\b/i,
  /\bimmediate attention\b/i,
  /\bsuspension warning\b/i,
  /\bauto[- ]renew(?:ed|ing)?\b/i,
];

export function detectUrgency(normalizedText: string): RuleEvaluation {
  const matched = URGENCY_PATTERNS.some((pattern) => pattern.test(normalizedText));

  if (matched) {
    return {
      rule_id: "URGENCY_LANGUAGE",
      triggered: true,
      points: WEIGHT_URGENCY,
      reason: "High-pressure urgency language detected urging immediate victim action.",
    };
  }

  return {
    rule_id: "URGENCY_LANGUAGE",
    triggered: false,
    points: 0,
    reason: "No abnormal urgency language detected.",
  };
}

/**
 * Rule: Credential harvesting request.
 * +35 if asking for OTP, password, PIN, banking details, card number, or CVV.
 */
export const CREDENTIAL_PATTERNS = [
  /\b(?:one[- ]time[- ]password|otp)\b/i,
  /\bpassword\b/i,
  /\bpin\b/i,
  /\bbank details\b/i,
  /\brouting number\b/i,
  /\baccount number\b/i,
  /\bcard number\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /\bsecurity code\b/i,
  /\bshare your code\b/i,
  /\bverify your identity by entering\b/i,
];

export function detectCredentialRequest(normalizedText: string): RuleEvaluation {
  const matched = CREDENTIAL_PATTERNS.some((pattern) => pattern.test(normalizedText));

  if (matched) {
    return {
      rule_id: "CREDENTIAL_REQUEST",
      triggered: true,
      points: WEIGHT_CREDENTIAL_REQUEST,
      reason: "Explicit request for sensitive credentials, OTP, password, PIN, or bank/card details.",
    };
  }

  return {
    rule_id: "CREDENTIAL_REQUEST",
    triggered: false,
    points: 0,
    reason: "No credential harvesting requests detected.",
  };
}

/**
 * Rule: External links.
 * +15 if external URL or link shortener is found.
 */
export const LINK_PATTERNS = [
  /https?:\/\/[^\s]+/i,
  /\bwww\.[^\s]+/i,
  /\b(?:bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|ow\.ly|buff\.ly)\/[^\s]+/i,
];

export function detectExternalLink(normalizedText: string): RuleEvaluation {
  const matched = LINK_PATTERNS.some((pattern) => pattern.test(normalizedText));

  if (matched) {
    return {
      rule_id: "EXTERNAL_LINK",
      triggered: true,
      points: WEIGHT_EXTERNAL_LINK,
      reason: "External URL or link shortener found embedded in transaction text.",
    };
  }

  return {
    rule_id: "EXTERNAL_LINK",
    triggered: false,
    points: 0,
    reason: "No external hyperlinks detected.",
  };
}

/**
 * Rule: High amount.
 * >= 5000 -> +20; >= 1000 -> +10 (only the higher applies).
 */
export function checkHighAmount(amount: number): RuleEvaluation {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  if (safeAmount >= 5000) {
    return {
      rule_id: "HIGH_AMOUNT_TIER_2",
      triggered: true,
      points: WEIGHT_HIGH_AMOUNT_HIGH,
      reason: `High transaction amount ($${safeAmount.toFixed(2)} >= $5,000).`,
    };
  }

  if (safeAmount >= 1000) {
    return {
      rule_id: "HIGH_AMOUNT_TIER_1",
      triggered: true,
      points: WEIGHT_HIGH_AMOUNT_MID,
      reason: `Elevated transaction amount ($${safeAmount.toFixed(2)} >= $1,000).`,
    };
  }

  return {
    rule_id: "AMOUNT_NORMAL",
    triggered: false,
    points: 0,
    reason: "Transaction amount is within standard consumer parameters.",
  };
}

/**
 * Rule: Suspicious instructions.
 * +25 if instructions involve calling phone numbers, gift cards, crypto, wire transfer,
 * remote access (AnyDesk, TeamViewer), or refund overpayment tricks.
 */
export const SUSPICIOUS_INSTRUCTION_PATTERNS = [
  /\bcall (?:this number|our helpline|us at|customer care|support at|cancellation helpline)\b/i,
  /(?:\+?1[-.\s]?)?\(?(?:800|888|877|866|855|844|833|900)\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
  /\bgift cards?\b/i,
  /\b(?:crypto|bitcoin|btc|ethereum|usdt|wallet transfer)\b/i,
  /\b(?:wire transfer|western union|moneygram)\b/i,
  /\b(?:remote access|anydesk|teamviewer|zoho assist|connectwise)\b/i,
  /\b(?:refund department|overpayment|accidental overpayment|claim your refund)\b/i,
];

export function detectSuspiciousInstructions(normalizedText: string): RuleEvaluation {
  const matched = SUSPICIOUS_INSTRUCTION_PATTERNS.some((p) => p.test(normalizedText));

  if (matched) {
    return {
      rule_id: "SUSPICIOUS_INSTRUCTIONS",
      triggered: true,
      points: WEIGHT_SUSPICIOUS_INSTRUCTIONS,
      reason: "Suspicious contact instructions detected (callback helpline, gift cards, crypto, wire transfer, or remote desktop software).",
    };
  }

  return {
    rule_id: "SUSPICIOUS_INSTRUCTIONS",
    triggered: false,
    points: 0,
    reason: "No suspicious callback or out-of-band payment instructions detected.",
  };
}

/**
 * Map integer score to RiskLevel per PROJECT_SPEC.md.
 * 0-54 SAFE, 55-84 NEEDS_REVIEW, 85-100 QUARANTINE.
 */
export function scoreToLevel(score: number): RiskLevel {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  if (clamped >= BAND_QUARANTINE_MIN) return "QUARANTINE";
  if (clamped >= BAND_NEEDS_REVIEW_MIN) return "NEEDS_REVIEW";
  return "SAFE";
}

/**
 * Return default recommended action string based on risk level.
 */
export function getRecommendedAction(level: RiskLevel): string {
  switch (level) {
    case "QUARANTINE":
      return "DO NOT PAY. High-risk scam indicators detected. The invoice has been quarantined to prevent unauthorized funds transfer. Verify only via the official PayPal app or website.";
    case "NEEDS_REVIEW":
      return "Exercise caution. Review this invoice carefully in your official PayPal account before authorizing payment. Never call phone numbers listed in the memo.";
    case "SAFE":
    default:
      return "Invoice appears consistent with standard payment patterns. Always confirm charges in your official PayPal account.";
  }
}

/**
 * Master calculation function combining all deterministic rules.
 */
export function calculateRisk(input: RiskEngineInput): RuleEngineResult {
  const normalized = normalizeText(input.content);

  const evaluations: RuleEvaluation[] = [
    checkPayPalVerification(input.invoiceId, input.paypalVerified),
    checkUnknownSender(input.senderKnown),
    detectUrgency(normalized),
    detectCredentialRequest(normalized),
    detectExternalLink(normalized),
    checkHighAmount(input.amount),
    detectSuspiciousInstructions(normalized),
  ];

  const triggeredRules = evaluations.filter((e) => e.triggered);

  // Sum points
  let score = triggeredRules.reduce((sum, r) => sum + r.points, 0);

  // OVERRIDE: if credential request is triggered AND paypal_verified is false, final score is at least 85.
  const credentialRule = evaluations.find((e) => e.rule_id === "CREDENTIAL_REQUEST");
  if (credentialRule?.triggered && !input.paypalVerified) {
    if (score < 85) {
      score = 85;
      triggeredRules.push({
        rule_id: "OVERRIDE_CREDENTIAL_UNVERIFIED",
        triggered: true,
        points: 0,
        reason: "Critical safety override: Credential request on unverified invoice enforces QUARANTINE (minimum score 85).",
      });
    }
  }

  // Integer clamp 0..100
  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));
  const level = scoreToLevel(clampedScore);
  const reasons = triggeredRules.map((r) => r.reason);
  const recommendedAction = getRecommendedAction(level);

  return {
    risk_score: clampedScore,
    risk_level: level,
    reasons: reasons.length > 0 ? reasons : ["No anomalous threat indicators triggered."],
    recommended_action: recommendedAction,
    triggered_rules: triggeredRules,
  };
}
