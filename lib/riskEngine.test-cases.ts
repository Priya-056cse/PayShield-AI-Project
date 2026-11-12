/**
 * PayShield AI - Risk Engine Test Cases
 * Unit-testable scenarios verifying deterministic scoring behavior.
 */

import type { RiskEngineInput } from "./riskEngine";
import type { RiskLevel } from "@/types/invoice";

export interface TestCase {
  id: string;
  name: string;
  input: RiskEngineInput;
  expectedLevel: RiskLevel;
  minScore: number;
  maxScore: number;
}

export const RISK_ENGINE_TEST_CASES: TestCase[] = [
  {
    id: "case-safe-verified",
    name: "Clean PayPal-verified invoice from known sender",
    input: {
      content: "Invoice for Web Design Services - Monthly Maintenance",
      sender: "designer@knownpartner.com",
      amount: 250,
      invoiceId: "INV2-SANDBOX-1001",
      paypalVerified: true,
      senderKnown: true,
    },
    expectedLevel: "SAFE",
    minScore: 0,
    maxScore: 54,
  },
  {
    id: "case-needs-review",
    name: "Urgent language + external link from unknown sender (without credential request)",
    input: {
      content: "Urgent: Final notice regarding your domain renewal. Check status at https://secure-domain-review.org",
      sender: "renewals@new-registrar.net",
      amount: 45,
      invoiceId: null, // +15 no invoiceId
      paypalVerified: false,
      senderKnown: false, // +15 unknown sender
      // +15 urgency + 15 external link = 60 points -> NEEDS_REVIEW (55-84)
    },
    expectedLevel: "NEEDS_REVIEW",
    minScore: 55,
    maxScore: 84,
  },
  {
    id: "case-quarantine-override",
    name: "OTP credential request on unverified invoice (triggers critical override)",
    input: {
      content: "Security update: To cancel accidental charges, enter your one-time password OTP immediately.",
      sender: "security-team@unverified-mail.com",
      amount: 0,
      invoiceId: "INV-FAKE-999",
      paypalVerified: false,
      senderKnown: false,
    },
    expectedLevel: "QUARANTINE",
    minScore: 85,
    maxScore: 100,
  },
  {
    id: "case-quarantine-geek-squad",
    name: "Classic Geek Squad renewal callback scam",
    input: {
      content: "INVOICE NOTICE: Geek Squad 3-Year Protection Auto-Renewed for $599.99. Call our helpline immediately at +1-800-555-0199 within 24 hours to cancel.",
      sender: "geeksquad-billing99@gmail.com",
      amount: 599.99,
      invoiceId: "INV2-FAKE-CALL",
      paypalVerified: false, // +30
      senderKnown: false, // +15
      // +15 urgency + 25 suspicious instructions = 85 -> QUARANTINE
    },
    expectedLevel: "QUARANTINE",
    minScore: 85,
    maxScore: 100,
  },
];
