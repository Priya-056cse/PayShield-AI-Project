import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  claimGmailMessage,
  addSecurityAuditLog,
  getSecurityEventById,
  getSecurityEventByExternalId,
  getGmailConnection,
  getGmailMessageRecord,
  getRiskReportById,
  saveGmailConnection,
  updateGmailHistoryId,
  updateSecurityEventAction,
  updateGmailMessageState,
  saveSecurityEvent,
} from "@/lib/db";
import { runAnalysis } from "@/lib/analyzeWorkflow";
import { logger } from "@/lib/logger";
import { analyzeEmailThreat } from "@/lib/securityAnalyzer";
import { applyEmailClassifier } from "@/lib/emailClassifier";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const OAUTH_COOKIE = "payshield-gmail-oauth";
const QUARANTINE_LABEL = "PayShield/Quarantined";
const REVIEW_LABEL = "PayShield/Review";

const googleConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  encryptionKey: z.string().min(1),
  stateSecret: z.string().min(32),
});

const oauthTokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
});

const profileSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.string().min(1),
});

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Buffer;
  stateSecret: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  labelIds?: string[];
  payload?: { headers?: GmailHeader[]; mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
}

interface GmailHistoryResponse {
  historyId?: string;
  history?: Array<{
    messagesAdded?: Array<{ message?: { id?: string } }>;
  }>;
  nextPageToken?: string;
}

const googleApiErrorSchema = z.object({
  error: z.object({ message: z.string().optional() }).optional(),
});

class GmailApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

function getGoogleConfig(): GoogleConfig {
  const parsed = googleConfigSchema.safeParse({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    encryptionKey: process.env.PAYSHIELD_TOKEN_ENCRYPTION_KEY,
    stateSecret: process.env.PAYSHIELD_OAUTH_STATE_SECRET,
  });
  if (!parsed.success) {
    throw new Error("Gmail integration is not configured. Set the Google OAuth, token encryption, and OAuth state variables.");
  }

  const encryptionKey = Buffer.from(parsed.data.encryptionKey, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error("PAYSHIELD_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  const redirect = new URL(parsed.data.redirectUri);
  if (process.env.NODE_ENV === "production" && redirect.protocol !== "https:") {
    throw new Error("GOOGLE_REDIRECT_URI must use HTTPS in production.");
  }

  return { ...parsed.data, encryptionKey };
}

function signState(state: string, secret: string): string {
  return createHmac("sha256", secret).update(`gmail:${state}`).digest("base64url");
}

/** Create the Google consent URL and signed state cookie for the Gmail OAuth flow. */
export function createGmailAuthorization(): { url: string; cookieValue: string } {
  const config = getGoogleConfig();
  const state = randomBytes(32).toString("base64url");
  const signature = signState(state, config.stateSecret);
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.modify");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return { url: url.toString(), cookieValue: `${state}.${signature}` };
}

/** Verify the OAuth callback state against the HttpOnly browser cookie. */
export function verifyGmailOAuthState(state: string, cookieValue: string | undefined): boolean {
  if (!cookieValue || !state) return false;
  const [cookieState, cookieSignature] = cookieValue.split(".");
  if (!cookieState || !cookieSignature || cookieState !== state) return false;

  const expected = signState(state, getGoogleConfig().stateSecret);
  const actualBytes = Buffer.from(cookieSignature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function encryptRefreshToken(token: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

function decryptRefreshToken(value: string, key: Buffer): string {
  const [ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Stored Gmail credential is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
      if (response.status < 500 && response.status !== 429) return response;
      lastError = new GmailApiError(response.status, "Google API temporarily unavailable.");
    } catch (error) {
      lastError = error;
    }

    if (attempt + 1 < attempts) {
      const delay = 250 * 2 ** attempt + Math.floor(Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Google API request failed.");
}

async function parseGoogleResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = googleApiErrorSchema.safeParse(payload);
    throw new GmailApiError(
      response.status,
      parsedError.success && parsedError.data.error?.message
        ? parsedError.data.error.message
        : "Google API request failed."
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error("Google API returned an invalid response.");
  return parsed.data;
}

async function exchangeCode(code: string): Promise<z.infer<typeof oauthTokenSchema>> {
  const config = getGoogleConfig();
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15000),
  });
  return parseGoogleResponse(response, oauthTokenSchema);
}

async function gmailRequest<T>(
  path: string,
  accessToken: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> {
  const response = await fetchWithRetry(`${GMAIL_API}/users/me/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  return parseGoogleResponse(response, schema);
}

const emptyObjectSchema = z.object({}).passthrough();
const labelsSchema = z.object({ labels: z.array(z.object({ id: z.string(), name: z.string() })).default([]) });
const labelSchema = z.object({ id: z.string(), name: z.string() });
const gmailPartSchema: z.ZodType<GmailPart> = z.lazy(() => z.object({
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  body: z.object({ data: z.string().optional() }).optional(),
  parts: z.array(gmailPartSchema).optional(),
}));
const gmailMessageSchema = z.object({
  id: z.string(),
  labelIds: z.array(z.string()).optional(),
  payload: z.object({
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    mimeType: z.string().optional(),
    body: z.object({ data: z.string().optional() }).optional(),
    parts: z.array(gmailPartSchema).optional(),
  }).optional(),
});

async function ensureLabel(accessToken: string, name: string): Promise<string> {
  const list = await gmailRequest("labels", accessToken, labelsSchema);
  const existing = (list.labels || []).find((label) => label.name === name);
  if (existing) return existing.id;

  const response = await gmailRequest("labels", accessToken, labelSchema, {
    method: "POST",
    body: JSON.stringify({
      name,
      labelListVisibility: "labelHide",
      messageListVisibility: "hide",
    }),
  });
  return response.id;
}

/** Exchange the consent code, create private labels, and save an encrypted refresh token. */
export async function finishGmailAuthorization(code: string): Promise<string> {
  const config = getGoogleConfig();
  const token = await exchangeCode(code);
  if (!token.refresh_token) {
    throw new Error("Google did not return a refresh token. Revoke PayShield access in Google Account settings and reconnect.");
  }

  const profileResponse = await fetchWithRetry(`${GMAIL_API}/users/me/profile`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = await parseGoogleResponse(profileResponse, profileSchema);
  const quarantineLabelId = await ensureLabel(token.access_token, QUARANTINE_LABEL);
  const reviewLabelId = await ensureLabel(token.access_token, REVIEW_LABEL);

  saveGmailConnection({
    email: profile.emailAddress,
    encrypted_refresh_token: encryptRefreshToken(token.refresh_token, config.encryptionKey),
    history_id: profile.historyId,
    quarantine_label_id: quarantineLabelId,
    review_label_id: reviewLabelId,
  });
  logger.info("Gmail account connected.", { email: profile.emailAddress });
  return profile.emailAddress;
}

async function getAccessToken(): Promise<{ accessToken: string; connection: NonNullable<ReturnType<typeof getGmailConnection>> }> {
  const config = getGoogleConfig();
  const connection = getGmailConnection();
  if (!connection) throw new Error("No Gmail account is connected.");

  let refreshToken: string;
  try {
    refreshToken = decryptRefreshToken(connection.encrypted_refresh_token, config.encryptionKey);
  } catch {
    throw new Error("Stored Gmail credentials cannot be decrypted. Reconnect the Gmail account using the current encryption key.");
  }

  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const token = await parseGoogleResponse(response, oauthTokenSchema);
  return { accessToken: token.access_token, connection };
}

function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function collectMessageContent(part: GmailPart | undefined, output: { text: string[]; attachments: string[] }): void {
  if (!part) return;
  if (part.filename) output.attachments.push(part.filename.slice(0, 200));
  if (part.body?.data && (part.mimeType === "text/plain" || part.mimeType === "text/html")) {
    const text = decodeBody(part.body.data);
    output.text.push(part.mimeType === "text/html"
      ? text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
      : text);
  }
  for (const child of part.parts || []) collectMessageContent(child, output);
}

function headerValue(headers: GmailHeader[], name: string): string {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function emailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^<>]+)>/);
  const candidate = (match?.[1] || fromHeader).trim().toLowerCase();
  const email = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return email?.[0] || "unknown-sender";
}

function senderDisplayName(fromHeader: string): string {
  return fromHeader.replace(/<[^<>]*>/g, "").replace(/^["']|["']$/g, "").trim().slice(0, 120);
}

function extractAmount(content: string): number {
  const match = content.match(/(?:USD\s*|\$\s*)([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return 0;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function extractInvoiceId(content: string): string | null {
  const match = content.match(/\binvoice(?:\s*(?:id|number|#))?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{5,39})/i);
  return match?.[1] || null;
}

const reportSchema = z.object({
  id: z.string(),
  risk_level: z.enum(["SAFE", "NEEDS_REVIEW", "QUARANTINE"]),
});

async function applyDecisionLabel(
  messageId: string,
  riskLevel: "SAFE" | "NEEDS_REVIEW" | "QUARANTINE",
  accessToken: string,
  connection: NonNullable<ReturnType<typeof getGmailConnection>>
): Promise<void> {
  if (riskLevel === "SAFE") return;
  await gmailRequest(`messages/${encodeURIComponent(messageId)}/modify`, accessToken, emptyObjectSchema, {
    method: "POST",
    body: JSON.stringify({
      addLabelIds: [riskLevel === "QUARANTINE" ? connection.quarantine_label_id : connection.review_label_id],
    }),
  });
}

async function processMessage(
  messageId: string,
  accessToken: string,
  connection: NonNullable<ReturnType<typeof getGmailConnection>>
): Promise<boolean> {
  let record = getGmailMessageRecord(messageId);
  if (record?.status === "DONE") return false;
  if (!claimGmailMessage(messageId)) return false;
  record = getGmailMessageRecord(messageId);

  try {
    if (record?.report_id) {
      const report = getRiskReportById(record.report_id);
      if (!report) throw new Error("Stored Gmail analysis report is missing.");
      const event = getSecurityEventByExternalId(messageId);
      const riskLevel = event
        ? event.risk_score >= 85
          ? "QUARANTINE"
          : event.risk_score >= 55
            ? "NEEDS_REVIEW"
            : "SAFE"
        : report.risk_level;
      await applyDecisionLabel(messageId, riskLevel, accessToken, connection);
      updateGmailMessageState(messageId, "DONE", report.id);
      return true;
    }

    const message = await gmailRequest(
      `messages/${encodeURIComponent(messageId)}?format=full`,
      accessToken,
      gmailMessageSchema
    );
    if (!message.labelIds?.includes("INBOX")) {
      updateGmailMessageState(messageId, "DONE", null);
      return false;
    }
    const headers = message.payload?.headers || [];
    const subject = headerValue(headers, "subject");
    const fromHeader = headerValue(headers, "from");
    const from = emailAddress(fromHeader);
    const displayName = senderDisplayName(fromHeader);
    const body = { text: [] as string[], attachments: [] as string[] };
    collectMessageContent(message.payload, body);
    const content = [
      ...body.text,
      body.attachments.length
        ? `Attachment filenames: ${body.attachments.map((name) => name.replace(/\b\d{4,8}\b/g, "[REDACTED]")).join(", ")}`
        : "",
    ].filter(Boolean).join("\n").slice(0, 5000);
    const ruleAnalysis = analyzeEmailThreat({
      sender: from,
      senderName: displayName,
      subject,
      content,
      attachments: body.attachments,
    });
    const emailAnalysis = applyEmailClassifier(`${subject}\n${content}`.slice(0, 12000), ruleAnalysis);
    const invoiceSignal = /\b(invoice|payment|receipt|bill|paypal|bank transfer|amount due)\b/i.test(content)
      || /\b(invoice|payment|receipt|bill|paypal|bank transfer|amount due)\b/i.test(subject)
      || body.attachments.some((name) => /\.(pdf|png|jpe?g|webp)$/i.test(name));

    let report: Awaited<ReturnType<typeof runAnalysis>> | null = null;
    if (invoiceSignal) {
      report = await runAnalysis({
        content: emailAnalysis.redactedContent,
        invoiceId: extractInvoiceId(emailAnalysis.redactedContent),
        sender: from,
        amount: extractAmount(emailAnalysis.redactedContent),
        source: "GMAIL",
      });
    }

    const riskScore = Math.max(emailAnalysis.riskScore, report?.risk_score || 0);
    const riskLevel = riskScore >= 85 ? "QUARANTINE" : riskScore >= 55 ? "NEEDS_REVIEW" : "SAFE";
    const event = saveSecurityEvent({
      eventType: "EMAIL",
      source: "GMAIL",
      externalId: messageId,
      riskScore,
      category: emailAnalysis.riskScore >= (report?.risk_score || 0) ? emailAnalysis.category : report?.category || emailAnalysis.category,
      action: riskLevel === "QUARANTINE" ? "QUARANTINED" : riskLevel === "NEEDS_REVIEW" ? "REVIEW" : "SAFE",
      summary: subject ? `Email analyzed: ${subject.replace(/\b\d{4,8}\b/g, "[REDACTED]")}` : "Email analyzed",
      reasons: Array.from(new Set([...emailAnalysis.reasons, ...(report?.reasons || [])])).slice(0, 8),
      urls: emailAnalysis.urls,
      threatUrls: emailAnalysis.threatUrls,
      sender: from,
    });
    addSecurityAuditLog(event.id, "DECISION_MADE", `Gmail risk score ${riskScore}; action ${event.action}.`);
    if (report) updateGmailMessageState(messageId, "ANALYZED", report.id);
    try {
      await applyDecisionLabel(messageId, riskLevel, accessToken, connection);
    } catch (error) {
      updateSecurityEventAction(event.id, "LABEL_ERROR");
      addSecurityAuditLog(event.id, "LABEL_FAILED", "Gmail label action failed; no message was deleted or moved.");
      throw error;
    }

    if (riskLevel === "QUARANTINE") {
      addSecurityAuditLog(event.id, "GMAIL_QUARANTINED", "Applied the reversible PayShield/Quarantined Gmail label.");
    } else if (riskLevel === "NEEDS_REVIEW") {
      addSecurityAuditLog(event.id, "GMAIL_REVIEW_LABEL", "Applied the reversible PayShield/Review Gmail label.");
    } else {
      addSecurityAuditLog(event.id, "MESSAGE_LEFT_UNCHANGED", "No Gmail labels were changed.");
    }
    updateGmailMessageState(messageId, "DONE", report?.id || null);
    return true;
  } catch (error) {
    updateGmailMessageState(messageId, "ERROR", record?.report_id || null);
    throw error;
  }
}

/** Remove PayShield labels from a quarantined Gmail message and record the reversible restore. */
export async function restoreGmailMessage(eventId: string): Promise<void> {
  const event = getSecurityEventById(eventId);
  if (!event || event.event_type !== "EMAIL" || event.source !== "GMAIL" || !event.external_id) {
    throw new Error("A Gmail security event is required to restore this item.");
  }
  if (event.action !== "QUARANTINED" && event.action !== "REVIEW" && event.action !== "LABEL_ERROR") {
    throw new Error("This Gmail event has no active PayShield review or quarantine label.");
  }

  const { accessToken, connection } = await getAccessToken();
  await gmailRequest(`messages/${encodeURIComponent(event.external_id)}/modify`, accessToken, emptyObjectSchema, {
    method: "POST",
    body: JSON.stringify({
      removeLabelIds: [connection.quarantine_label_id, connection.review_label_id],
    }),
  });
  updateSecurityEventAction(eventId, "RESTORED");
  addSecurityAuditLog(eventId, "GMAIL_RESTORED", "Removed PayShield review and quarantine labels at the user's request.");
}

async function listRecentMessageIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`${GMAIL_API}/users/me/messages`);
    url.searchParams.set("q", "newer_than:3d");
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetchWithRetry(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = await parseGoogleResponse(response, z.object({
      messages: z.array(z.object({ id: z.string() })).optional(),
      nextPageToken: z.string().optional(),
    }));
    ids.push(...(result.messages || []).map((message) => message.id));
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}

/** Poll Gmail history, analyze every new inbox message, and apply only reversible labels. */
export async function syncGmail(): Promise<{ processed: number; account: string }> {
  const { accessToken, connection } = await getAccessToken();
  const ids = new Set<string>();
  let nextPageToken: string | undefined;
  let currentHistoryId: string | undefined;

  try {
    do {
      const url = new URL(`${GMAIL_API}/users/me/history`);
      url.searchParams.set("startHistoryId", connection.history_id);
      url.searchParams.set("historyTypes", "messageAdded");
      if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);
      const response = await fetchWithRetry(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const page = await parseGoogleResponse(response, z.object({
        historyId: z.string().optional(),
        history: z.array(z.object({
          messagesAdded: z.array(z.object({ message: z.object({ id: z.string() }).optional() })).optional(),
        })).optional(),
        nextPageToken: z.string().optional(),
      })) as GmailHistoryResponse;
      currentHistoryId = page.historyId || currentHistoryId;
      for (const entry of page.history || []) {
        for (const added of entry.messagesAdded || []) {
          if (added.message?.id) ids.add(added.message.id);
        }
      }
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);
  } catch (error) {
    if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
    logger.warn("Gmail history cursor expired; recovering messages from the last three days.");
    for (const id of await listRecentMessageIds(accessToken)) ids.add(id);
    const profileResponse = await fetchWithRetry(`${GMAIL_API}/users/me/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await parseGoogleResponse(profileResponse, profileSchema);
    currentHistoryId = profile.historyId;
  }

  let processed = 0;
  for (const messageId of Array.from(ids)) {
    if (await processMessage(messageId, accessToken, connection)) processed += 1;
  }

  if (currentHistoryId) updateGmailHistoryId(currentHistoryId);
  return { processed, account: connection.email };
}

/** Return the non-sensitive status of the configured Gmail integration. */
export function getGmailStatus(): { connected: boolean; email?: string; lastUpdated?: string } {
  const connection = getGmailConnection();
  if (!connection) return { connected: false };
  return {
    connected: true,
    email: connection.email,
  };
}

export { OAUTH_COOKIE };
