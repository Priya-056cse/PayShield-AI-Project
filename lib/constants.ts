/**
 * PayShield AI - Application Constants
 * No fake/mock data in production code per PROJECT_SPEC.md.
 */

export const APP_CONFIG = {
  name: "PayShield AI",
  tagline: "Your Personal PayPal Scam Defense Agent",
  description:
    "Autonomous AI-powered security agent that inspects PayPal invoices, payment requests, and incoming transaction notes in real-time. Instantly calculates deterministic risk scores, exposes deceptive fraud patterns, and quarantines malicious charges before funds leave your account.",
  navLinks: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Threat Models", href: "#threat-models" },
  ],
  version: "1.0.0",
};

export const RISK_THRESHOLDS = {
  SAFE_MAX: 54,
  NEEDS_REVIEW_MIN: 55,
  NEEDS_REVIEW_MAX: 84,
  QUARANTINE_MIN: 85,
};
