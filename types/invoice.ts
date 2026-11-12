/**
 * PayShield AI - Core Invoice & Risk Analysis Types
 * Target Architecture per PROJECT_SPEC.md
 */

export type RiskLevel = "SAFE" | "NEEDS_REVIEW" | "QUARANTINE";

export type AICategory =
  | "PHISHING"
  | "FAKE_INVOICE"
  | "IMPERSONATION"
  | "SAFE"
  | "UNKNOWN";

export type AIConfidence = "LOW" | "MEDIUM" | "HIGH";

export type QuarantineStatus = "QUARANTINED" | "RELEASED" | "REPORTED_SCAM";

export type FeedbackAction = "MARK_SAFE" | "REPORT_SCAM";

export type InvoiceSource = "API" | "WEBHOOK" | "SIMULATED" | "GMAIL";

export type ReportActionTaken =
  | "NO_ACTION"
  | "QUARANTINED"
  | "RELEASED"
  | "REPORTED_SCAM"
  | "CANCELLATION_FAILED"
  | "CANCELLED"
  | "DELETED";

export interface ListedRiskReport extends RiskReport {
  action_taken: ReportActionTaken;
}

/**
 * Exact response returned by POST /api/analyze and runAnalysis()
 */
export interface InvoiceAnalysis {
  id: string;
  invoice_id: string | null;
  sender: string;
  amount: number;
  paypal_verified: boolean;
  risk_score: number;
  risk_level: RiskLevel;
  category: AICategory;
  reasons: string[];
  recommended_action: string;
  ai_confidence: AIConfidence;
  created_at: string;
}

/**
 * Stored database record in risk_reports table
 */
export interface RiskReport {
  id: string;
  invoice_id: string | null;
  sender: string;
  amount: number;
  content: string;
  risk_score: number;
  risk_level: RiskLevel;
  category: AICategory;
  reasons: string[];
  recommended_action: string;
  paypal_verified: boolean;
  ai_confidence: AIConfidence;
  created_at: string;
  updated_at: string;
}

/**
 * Record in quarantine_items table
 */
export interface QuarantineItem {
  id: string;
  risk_report_id: string;
  invoice_id: string | null;
  status: QuarantineStatus;
  reason: string;
  created_at: string;
  resolved_at: string | null;
}

/**
 * Record in user_feedback table
 */
export interface UserFeedback {
  id: string;
  risk_report_id: string;
  action: FeedbackAction;
  note: string | null;
  created_at: string;
}

/**
 * Record in invoices table
 */
export interface StoredInvoice {
  id: string;
  paypal_invoice_id: string | null;
  sender: string;
  amount: number;
  currency: string;
  note: string;
  status: string;
  source: InvoiceSource;
  created_at: string;
}

/**
 * Structure representing a verified PayPal Sandbox Invoice
 */
export interface PayPalInvoice {
  id: string;
  status: string;
  amount?: {
    currency_code?: string;
    value?: string;
  };
  detail?: {
    invoice_number?: string;
    memo?: string;
    note?: string;
  };
  invoicer?: {
    email_address?: string;
    name?: {
      given_name?: string;
      surname?: string;
      full_name?: string;
    };
  };
  primary_recipients?: Array<{
    billing_info?: {
      email_address?: string;
    };
  }>;
}

/**
 * Pure rule engine result
 */
export interface RuleEvaluation {
  rule_id: string;
  triggered: boolean;
  points: number;
  reason: string;
}

export interface RuleEngineResult {
  risk_score: number;
  risk_level: RiskLevel;
  reasons: string[];
  recommended_action: string;
  triggered_rules: RuleEvaluation[];
}
