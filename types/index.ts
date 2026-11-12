/**
 * PayShield AI - Type Exports
 * Re-exports target types from types/invoice.ts per PROJECT_SPEC.md.
 */

export * from "./invoice";

// Legacy compatibility types during transitional phases (Phases 1-3)
export type LegacyRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DashboardMetrics {
  totalAnalyzed: number;
  quarantinedThreats: number;
  fundsProtected: number;
  activeRiskIndex: number;
  agentStatus: "ACTIVE_ARMED" | "MONITORING_STANDBY" | "PAUSED";
  lastScanTimestamp: string;
}

export type TransactionType = "invoice" | "payment_request" | "suspicious_message";

export type ThreatCategory =
  | "TECH_SUPPORT_CALLBACK_SCAM"
  | "FAKE_RENEWAL_FRAUD"
  | "OVERPAYMENT_REFUND_SCAM"
  | "CRYPTO_RANSOM_MEMO"
  | "PHISHING_URL_INJECTION"
  | "UNAUTHORIZED_SERVICE_FEE"
  | "LEGITIMATE_MERCHANT";

export interface RiskFactor {
  id: string;
  label: string;
  severity: "low" | "medium" | "high";
  scoreImpact: number;
  description: string;
  matchedPattern?: string;
}

export interface ScamAnalysisResult {
  id: string;
  paypalItemId: string;
  type: TransactionType;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  amount: number;
  currency: string;
  subjectOrMemo: string;
  receivedAt: string;
  analyzedAt: string;
  riskScore: number;
  riskLevel: LegacyRiskLevel;
  threatCategory: ThreatCategory;
  summaryExplanation: string;
  detailedReasons: string[];
  riskFactors: RiskFactor[];
  quarantineStatus: string;
  recommendedAction: string;
  callbackPhoneNumberDetected?: string;
  suspiciousUrls?: string[];
}
