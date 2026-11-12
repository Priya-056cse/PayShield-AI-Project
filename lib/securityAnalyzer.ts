export type SecurityRiskLevel = "SAFE" | "REVIEW" | "QUARANTINE";

export interface SecurityAnalysis {
  riskScore: number;
  riskLevel: SecurityRiskLevel;
  category: string;
  reasons: string[];
  urls: string[];
  threatUrls: Array<{ url: string; riskScore: number; category: string }>;
  redactedContent: string;
}

export interface UrlAnalysis extends SecurityAnalysis {
  normalizedUrl: string;
}

export interface CallAnalysis extends SecurityAnalysis {
  recommendedAction: string;
}

const TRUSTED_BRAND_DOMAINS = [
  "paypal.com",
  "google.com",
  "microsoft.com",
  "apple.com",
  "amazon.com",
  "ebay.com",
];

const SHORTENER_DOMAINS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "is.gd",
  "cutt.ly",
  "ow.ly",
  "rebrand.ly",
]);

const RISKY_ATTACHMENT_EXTENSIONS = /\.(?:exe|msi|bat|cmd|com|scr|js|jse|vbs|vbe|ps1|jar|lnk|iso|hta)$/i;

function clampRisk(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function levelForScore(score: number): SecurityRiskLevel {
  if (score >= 85) return "QUARANTINE";
  if (score >= 55) return "REVIEW";
  return "SAFE";
}

function isTrustedBrandHost(hostname: string, brandDomain: string): boolean {
  return hostname === brandDomain || hostname.endsWith(`.${brandDomain}`);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function normalizedUrlForStorage(url: URL): string {
  const safePath = url.pathname.replace(/\b\d{4,8}\b/g, "[REDACTED]");
  return `${url.origin}${safePath}`.slice(0, 2048);
}

function getUrlRisk(rawUrl: string): { score: number; reasons: string[]; host: string; url: URL | null } {
  let url: URL;
  try {
    url = new URL(rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl);
  } catch {
    return { score: 30, reasons: ["Malformed URL"], host: "", url: null };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { score: 50, reasons: ["Non-web URL scheme"], host: url.hostname, url };
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const reasons: string[] = [];
  let score = 0;

  if (url.protocol !== "https:") {
    score += 15;
    reasons.push("Link does not use HTTPS");
  }
  if (hostname.startsWith("xn--") || hostname.split(".").some((label) => label.startsWith("xn--"))) {
    score += 35;
    reasons.push("Internationalized/punycode domain may disguise its name");
  }
  if (SHORTENER_DOMAINS.has(hostname)) {
    score += 55;
    reasons.push("Link uses a URL-shortening service");
  }
  if (url.username || url.password) {
    score += 35;
    reasons.push("URL contains misleading user information");
  }
  if (/\b(?:login|signin|verify|payment|account|secure|update)\b/i.test(url.pathname)) {
    score += 10;
    reasons.push("URL path contains a sensitive-action keyword");
  }

  for (const brandDomain of TRUSTED_BRAND_DOMAINS) {
    const brand = brandDomain.split(".")[0];
    const labels = hostname.split(".");
    const lookalike = labels.some((label) => {
      const base = label.replace(/[^a-z0-9]/g, "");
      return base.length >= brand.length - 1
        && base.length <= brand.length + 2
        && editDistance(base, brand) <= 2;
    });
    if ((hostname.includes(brand) || lookalike) && !isTrustedBrandHost(hostname, brandDomain)) {
      score += 65;
      reasons.push(`Domain imitates ${brand}`);
      break;
    }
  }

  return { score: clampRisk(score), reasons, host: hostname, url };
}

function extractUrls(content: string): string[] {
  const matches = content.match(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi) || [];
  return Array.from(new Set(matches.map((match) => match.replace(/[),.;!?]+$/g, "")))).slice(0, 20);
}

function redactOtpValues(content: string): string {
  return content
    .replace(
      /\b((?:otp|one[-\s]?time(?: password| code)?|verification(?: code)?|security(?: code)?|login(?: code)?|passcode|code)\s*(?:is|:|=)?\s*)\d{4,8}\b/gi,
      "$1[REDACTED]"
    )
    .replace(
      /\b\d{4,8}\b(?=.{0,20}\b(?:as|is)\s+(?:your\s+)?(?:otp|one[-\s]?time password|verification code|security code|passcode)\b)/gi,
      "[REDACTED]"
    );
}

function removeNegatedSecretRequests(content: string): string {
  return content.replace(
    /\b(?:do not|don't|never)\s+(?:share|send|tell|provide|read|repeat|enter|submit)\b/gi,
    "[NEGATED ACTION]"
  );
}

/** Classify untrusted mail with deterministic signals and redact likely OTP values. */
export function analyzeEmailThreat(input: {
  sender: string;
  senderName?: string;
  subject: string;
  content: string;
  attachments?: string[];
}): SecurityAnalysis {
  const content = `${input.subject}\n${input.content}`.slice(0, 12000);
  const lower = content.toLowerCase();
  const requestText = removeNegatedSecretRequests(content);
  const sender = input.sender.toLowerCase();
  const reasons: string[] = [];
  const urls = extractUrls(content);
  let score = 0;
  let category = "EMAIL";

  const asksForOtp = /\b(?:share|send|tell|provide|read|reply with|enter|submit)\b.{0,70}\b(?:otp|one[-\s]?time password|verification code|security code|passcode)\b/i.test(requestText)
    || /\b(?:otp|one[-\s]?time password|verification code|security code|passcode)\b.{0,70}\b(?:share|send|tell|provide|read|reply|enter|submit)\b/i.test(requestText);
  if (asksForOtp) {
    score += 75;
    reasons.push("Message asks the recipient to disclose or enter an authentication code");
    category = "OTP_PHISHING";
  } else if (/\b(?:otp|one[-\s]?time password|verification code|security code|passcode)\b/i.test(content)) {
    category = "LEGITIMATE_OTP";
    reasons.push("Authentication-code content detected; values are redacted and no block is applied by this signal alone");
  }

  const requestsCredentials = /\b(?:password|pin|cvv|card number|bank details|account number)\b/i.test(content)
    && /\b(?:share|send|provide|reply|confirm|verify|enter|submit)\b/i.test(content);
  if (requestsCredentials) {
    score += 45;
    reasons.push("Message requests sensitive account or payment credentials");
    if (category === "EMAIL") category = "CREDENTIAL_PHISHING";
  }

  const impersonatesPaypal = /\b(?:paypal|pay pal)\b/i.test(`${input.senderName || ""} ${input.subject}`);
  const senderDomain = sender.split("@")[1] || "";
  const senderSpoofsPaypal = impersonatesPaypal && !isTrustedBrandHost(senderDomain, "paypal.com");
  if (senderSpoofsPaypal) {
    score += 55;
    reasons.push("PayPal branding appears with a sender outside paypal.com");
    if (category === "EMAIL") category = "BRAND_IMPERSONATION";
  }

  if (/\b(?:urgent|immediately|within \d+ hours?|final notice|account (?:will be )?suspended|act now|blocked today)\b/i.test(content)) {
    score += 15;
    reasons.push("Message uses urgency or account-threat language");
  }

  const urlsRisk = urls.map((url) => getUrlRisk(url));
  const strongestUrlRisk = urlsRisk.reduce((strongest, item) => Math.max(strongest, item.score), 0);
  if (strongestUrlRisk >= 35) {
    score += Math.min(40, strongestUrlRisk);
    reasons.push(...urlsRisk.flatMap((item) => item.reasons).slice(0, 3));
    if (category === "EMAIL") category = "SUSPICIOUS_LINK";
  }

  const suspiciousAttachments = (input.attachments || []).filter((name) => RISKY_ATTACHMENT_EXTENSIONS.test(name));
  if (suspiciousAttachments.length > 0) {
    score += 40;
    reasons.push("Message includes an executable or script-like attachment");
    if (category === "EMAIL") category = "SUSPICIOUS_ATTACHMENT";
  }

  if (/\b(?:refund|invoice|payment request)\b/i.test(lower) && /\b(?:call|transfer|wire|gift card|crypto|remote access|anydesk|teamviewer)\b/i.test(lower)) {
    score += 25;
    reasons.push("Payment message includes a common callback, transfer, or remote-access scam indicator");
    if (category === "EMAIL") category = "PAYMENT_SCAM";
  }

  const legitimateOtp = category === "LEGITIMATE_OTP"
    && /\b(?:do not share|don't share|never share|sign[- ]?in|login|verification)\b/i.test(content)
    && !asksForOtp;
  if (legitimateOtp && score < 55) score = Math.min(score, 20);

  const riskScore = clampRisk(score);
  return {
    riskScore,
    riskLevel: levelForScore(riskScore),
    category,
    reasons: Array.from(new Set(reasons)).slice(0, 8),
    urls: urls.map((rawUrl) => {
      const parsed = getUrlRisk(rawUrl).url;
      return parsed ? normalizedUrlForStorage(parsed) : rawUrl.slice(0, 2048);
    }),
    threatUrls: urlsRisk.flatMap((item) => item.score >= 55 && item.url
      ? [{
          url: normalizedUrlForStorage(item.url),
          riskScore: item.score,
          category: "SUSPICIOUS_URL",
        }]
      : []),
    redactedContent: redactOtpValues(content).slice(0, 5000),
  };
}

/** Inspect URL syntax and local brand/shortener patterns without making a network request. */
export function analyzeUrlThreat(rawUrl: string): UrlAnalysis {
  const urlResult = getUrlRisk(rawUrl);
  const parsed = urlResult.url;
  const normalizedUrl = parsed ? normalizedUrlForStorage(parsed) : rawUrl.slice(0, 2048);
  const riskScore = clampRisk(urlResult.score);
  const reasons = urlResult.reasons.length > 0 ? urlResult.reasons : ["No high-risk URL pattern detected by offline checks"];
  return {
    riskScore,
    riskLevel: levelForScore(riskScore),
    category: riskScore >= 55 ? "SUSPICIOUS_URL" : "URL_CHECKED",
    reasons,
    urls: urlResult.host ? [urlResult.host] : [],
    threatUrls: riskScore >= 55
      ? [{ url: normalizedUrl, riskScore, category: "SUSPICIOUS_URL" }]
      : [],
    redactedContent: "",
    normalizedUrl,
  };
}

/** Score a supplied call description; this does not query caller reputation or block calls. */
export function analyzeCallThreat(input: {
  callerName?: string;
  description: string;
  transcript?: string;
}): CallAnalysis {
  const content = `${input.callerName || ""}\n${input.description}\n${input.transcript || ""}`.slice(0, 5000);
  const requestText = removeNegatedSecretRequests(content);
  const reasons: string[] = [];
  let score = 0;
  let category = "UNKNOWN_CALL";

  if (/\b(?:bank|paypal|customer support|customer care|technical support|refund team)\b/i.test(content)) {
    score += 25;
    reasons.push("Caller claims a financial or support identity");
    category = "IMPERSONATION_CALL";
  }
  if (/\b(?:otp|one[-\s]?time password|verification code|passcode)\b/i.test(requestText)
    && /\b(?:share|read|tell|send|provide|repeat)\b/i.test(requestText)) {
    score += 50;
    reasons.push("Caller requests an authentication code");
    category = "OTP_THEFT_CALL";
  }
  if (/\b(?:transfer|wire|gift card|crypto|payment authorization|send money)\b/i.test(content)) {
    score += 35;
    reasons.push("Caller requests a payment or money transfer");
    if (category === "UNKNOWN_CALL") category = "PAYMENT_SCAM_CALL";
  }
  if (/\b(?:anydesk|teamviewer|remote access|install an app|screen share)\b/i.test(content)) {
    score += 35;
    reasons.push("Caller requests remote access or screen sharing");
    if (category === "UNKNOWN_CALL") category = "REMOTE_ACCESS_SCAM";
  }
  if (/\b(?:urgent|immediately|account (?:will be )?blocked|threat|within \d+ minutes?)\b/i.test(content)) {
    score += 20;
    reasons.push("Caller uses urgency or threats");
  }

  const riskScore = clampRisk(score);
  const riskLevel = levelForScore(riskScore);
  return {
    riskScore,
    riskLevel,
    category,
    reasons: reasons.length > 0 ? reasons : ["No listed scam indicator detected from the supplied call description"],
    urls: [],
    threatUrls: [],
    redactedContent: redactOtpValues(content),
    recommendedAction: riskLevel === "QUARANTINE"
      ? "High-risk simulated call. A native call-screening integration is required to block real calls."
      : riskLevel === "REVIEW"
        ? "Flag this call for review; this web app cannot intercept phone calls."
        : "No high-risk call pattern detected. This is not a caller reputation lookup.",
  };
}
