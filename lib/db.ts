import "server-only";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type {
  StoredInvoice,
  RiskReport,
  QuarantineItem,
  UserFeedback,
  RiskLevel,
  AICategory,
  AIConfidence,
  QuarantineStatus,
  FeedbackAction,
  ListedRiskReport,
  ReportActionTaken,
} from "@/types/invoice";

/**
 * Custom typed error for database operations to prevent leaking internal stack traces or raw queries.
 */
export class DatabaseError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = "DATABASE_ERROR") {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
  }
}

let dbInstance: Database.Database | null = null;

/**
 * Get or initialize the SQLite singleton database connection.
 * Configures WAL mode, foreign keys, and idempotently ensures all 5 tables exist.
 */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  try {
    const dbPath = process.env.DATABASE_PATH || "./data/payshield.db";
    const resolvedPath = path.resolve(process.cwd(), dbPath);
    const dir = path.dirname(resolvedPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(resolvedPath);

    // Performance and safety pragmas
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Initialize all 5 tables per PROJECT_SPEC.md
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        paypal_invoice_id TEXT,
        sender TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('API', 'WEBHOOK', 'SIMULATED', 'GMAIL')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS risk_reports (
        id TEXT PRIMARY KEY,
        invoice_id TEXT,
        sender TEXT NOT NULL,
        amount REAL NOT NULL,
        content TEXT NOT NULL,
        risk_score INTEGER NOT NULL,
        risk_level TEXT NOT NULL,
        category TEXT NOT NULL,
        reasons TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        paypal_verified INTEGER NOT NULL,
        ai_confidence TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quarantine_items (
        id TEXT PRIMARY KEY,
        risk_report_id TEXT NOT NULL,
        invoice_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('QUARANTINED', 'RELEASED', 'REPORTED_SCAM')),
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        paypal_action_attempted_at TEXT,
        paypal_action_completed_at TEXT,
        paypal_action_response TEXT,
        paypal_action_error TEXT,
        paypal_invoice_status TEXT,
        FOREIGN KEY (risk_report_id) REFERENCES risk_reports(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_feedback (
        id TEXT PRIMARY KEY,
        risk_report_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('MARK_SAFE', 'REPORT_SCAM')),
        note TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (risk_report_id) REFERENCES risk_reports(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS processed_webhook_events (
        event_id TEXT PRIMARY KEY,
        received_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reports_sender ON risk_reports(sender);
      CREATE INDEX IF NOT EXISTS idx_reports_level ON risk_reports(risk_level);
      CREATE INDEX IF NOT EXISTS idx_quarantine_report ON quarantine_items(risk_report_id);
    `);

    const invoiceTableSql = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'invoices'")
      .get() as { sql: string } | undefined;
    if (invoiceTableSql && !invoiceTableSql.sql.includes("'GMAIL'")) {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE invoices_migrated (
            id TEXT PRIMARY KEY,
            paypal_invoice_id TEXT,
            sender TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            note TEXT,
            status TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('API', 'WEBHOOK', 'SIMULATED', 'GMAIL')),
            created_at TEXT NOT NULL
          );
          INSERT INTO invoices_migrated
            (id, paypal_invoice_id, sender, amount, currency, note, status, source, created_at)
          SELECT id, paypal_invoice_id, sender, amount, currency, note, status, source, created_at
          FROM invoices;
          DROP TABLE invoices;
          ALTER TABLE invoices_migrated RENAME TO invoices;
        `);
      })();
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS gmail_connection (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        email TEXT NOT NULL,
        encrypted_refresh_token TEXT NOT NULL,
        history_id TEXT NOT NULL,
        quarantine_label_id TEXT NOT NULL,
        review_label_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gmail_processed_messages (
        message_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'ANALYZED', 'DONE', 'ERROR')),
        report_id TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL CHECK (event_type IN ('EMAIL', 'URL', 'CALL')),
        source TEXT NOT NULL,
        external_id TEXT,
        risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        reasons TEXT NOT NULL,
        urls TEXT NOT NULL,
        sender TEXT,
        created_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_security_event_external_id
        ON security_events(external_id) WHERE external_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_security_events_created
        ON security_events(created_at);

      CREATE TABLE IF NOT EXISTS security_audit_logs (
        id TEXT PRIMARY KEY,
        security_event_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (security_event_id) REFERENCES security_events(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_security_audit_event
        ON security_audit_logs(security_event_id, created_at);

      CREATE TABLE IF NOT EXISTS threat_urls (
        normalized_url TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
        category TEXT NOT NULL,
        source_event_id TEXT NOT NULL,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        FOREIGN KEY (source_event_id) REFERENCES security_events(id) ON DELETE CASCADE
      );
    `);

    const quarantineColumns = new Set(
      (db.prepare("PRAGMA table_info(quarantine_items)").all() as Array<{ name: string }>).map((column) => column.name)
    );
    const cancellationColumns = [
      ["paypal_action_attempted_at", "TEXT"],
      ["paypal_action_completed_at", "TEXT"],
      ["paypal_action_response", "TEXT"],
      ["paypal_action_error", "TEXT"],
      ["paypal_invoice_status", "TEXT"],
    ] as const;

    for (const [column, type] of cancellationColumns) {
      if (!quarantineColumns.has(column)) {
        db.exec(`ALTER TABLE quarantine_items ADD COLUMN ${column} ${type}`);
      }
    }

    dbInstance = db;
    return dbInstance;
  } catch (error) {
    throw new DatabaseError(
      `Failed to initialize SQLite database: ${error instanceof Error ? error.message : "Unknown error"}`,
      "DB_INIT_FAILED"
    );
  }
}

/**
 * Safely parse reasons JSON array from database column.
 */
function parseReasons(reasonsRaw: string): string[] {
  try {
    const parsed = JSON.parse(reasonsRaw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [reasonsRaw];
  }
}

function parseActionTaken(action: unknown): ReportActionTaken {
  switch (action) {
    case "QUARANTINED":
    case "RELEASED":
    case "REPORTED_SCAM":
    case "CANCELLATION_FAILED":
    case "CANCELLED":
    case "DELETED":
      return action;
    default:
      return "NO_ACTION";
  }
}

/**
 * Save an invoice record.
 */
export function saveInvoice(invoice: Omit<StoredInvoice, "id" | "created_at"> & { id?: string }): StoredInvoice {
  const db = getDb();
  const id = invoice.id || crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const stmt = db.prepare(`
      INSERT INTO invoices (id, paypal_invoice_id, sender, amount, currency, note, status, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      invoice.paypal_invoice_id || null,
      invoice.sender,
      invoice.amount,
      invoice.currency,
      invoice.note || "",
      invoice.status,
      invoice.source,
      createdAt
    );

    return {
      id,
      paypal_invoice_id: invoice.paypal_invoice_id || null,
      sender: invoice.sender,
      amount: invoice.amount,
      currency: invoice.currency,
      note: invoice.note,
      status: invoice.status,
      source: invoice.source,
      created_at: createdAt,
    };
  } catch (error) {
    throw new DatabaseError("Failed to save invoice record.", "SAVE_INVOICE_FAILED");
  }
}

/**
 * Save a risk report record.
 */
export function saveRiskReport(
  report: Omit<RiskReport, "id" | "created_at" | "updated_at"> & { id?: string }
): RiskReport {
  const db = getDb();
  const id = report.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const reasonsJson = JSON.stringify(report.reasons || []);

  try {
    const stmt = db.prepare(`
      INSERT INTO risk_reports (
        id, invoice_id, sender, amount, content, risk_score, risk_level,
        category, reasons, recommended_action, paypal_verified, ai_confidence,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      report.invoice_id || null,
      report.sender,
      report.amount,
      report.content,
      Math.round(report.risk_score),
      report.risk_level,
      report.category,
      reasonsJson,
      report.recommended_action,
      report.paypal_verified ? 1 : 0,
      report.ai_confidence,
      now,
      now
    );

    return {
      id,
      invoice_id: report.invoice_id || null,
      sender: report.sender,
      amount: report.amount,
      content: report.content,
      risk_score: report.risk_score,
      risk_level: report.risk_level,
      category: report.category,
      reasons: report.reasons,
      recommended_action: report.recommended_action,
      paypal_verified: report.paypal_verified,
      ai_confidence: report.ai_confidence,
      created_at: now,
      updated_at: now,
    };
  } catch (error) {
    throw new DatabaseError("Failed to save risk report.", "SAVE_REPORT_FAILED");
  }
}

/**
 * Retrieve a risk report by ID.
 */
export function getRiskReportById(id: string): RiskReport | null {
  const db = getDb();

  try {
    const stmt = db.prepare(`SELECT * FROM risk_reports WHERE id = ?`);
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: String(row.id),
      invoice_id: row.invoice_id ? String(row.invoice_id) : null,
      sender: String(row.sender),
      amount: Number(row.amount),
      content: String(row.content),
      risk_score: Number(row.risk_score),
      risk_level: row.risk_level as RiskLevel,
      category: row.category as AICategory,
      reasons: parseReasons(String(row.reasons)),
      recommended_action: String(row.recommended_action),
      paypal_verified: Boolean(row.paypal_verified),
      ai_confidence: row.ai_confidence as AIConfidence,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  } catch (error) {
    throw new DatabaseError("Failed to query risk report.", "GET_REPORT_FAILED");
  }
}

/**
 * List risk reports with filtering, searching, and pagination.
 */
export function listRiskReports(filter?: {
  risk_level?: RiskLevel;
  q?: string;
  limit?: number;
  offset?: number;
}): { items: ListedRiskReport[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.risk_level) {
    conditions.push("r.risk_level = ?");
    params.push(filter.risk_level);
  }

  if (filter?.q && filter.q.trim().length > 0) {
    const searchPattern = `%${filter.q.trim()}%`;
    conditions.push("(r.sender LIKE ? OR r.invoice_id LIKE ? OR r.content LIKE ?)");
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    // Total count
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM risk_reports r ${whereClause}`);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult?.count || 0;

    // Items with pagination
    const limit = Math.min(Math.max(filter?.limit || 50, 1), 100);
    const offset = Math.max(filter?.offset || 0, 0);

    const itemsStmt = db.prepare(`
      SELECT r.*,
        CASE
          WHEN q.paypal_action_completed_at IS NOT NULL AND q.paypal_invoice_status = 'CANCELLED'
            THEN 'CANCELLED'
          WHEN q.paypal_action_completed_at IS NOT NULL AND q.paypal_invoice_status = 'DELETED'
            THEN 'DELETED'
          WHEN q.status = 'RELEASED' THEN 'RELEASED'
          WHEN q.status = 'REPORTED_SCAM' THEN 'REPORTED_SCAM'
          WHEN q.paypal_action_attempted_at IS NOT NULL THEN 'CANCELLATION_FAILED'
          WHEN q.status = 'QUARANTINED' THEN 'QUARANTINED'
          ELSE 'NO_ACTION'
        END AS action_taken
      FROM risk_reports r
      LEFT JOIN quarantine_items q ON q.id = (
        SELECT q2.id
        FROM quarantine_items q2
        WHERE q2.risk_report_id = r.id
        ORDER BY datetime(q2.created_at) DESC
        LIMIT 1
      )
      ${whereClause}
      ORDER BY datetime(r.created_at) DESC
      LIMIT ? OFFSET ?
    `);

    const rows = itemsStmt.all(...params, limit, offset) as Array<Record<string, unknown>>;

    const items: ListedRiskReport[] = rows.map((row) => ({
      id: String(row.id),
      invoice_id: row.invoice_id ? String(row.invoice_id) : null,
      sender: String(row.sender),
      amount: Number(row.amount),
      content: String(row.content),
      risk_score: Number(row.risk_score),
      risk_level: row.risk_level as RiskLevel,
      category: row.category as AICategory,
      reasons: parseReasons(String(row.reasons)),
      recommended_action: String(row.recommended_action),
      paypal_verified: Boolean(row.paypal_verified),
      ai_confidence: row.ai_confidence as AIConfidence,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      action_taken: parseActionTaken(row.action_taken),
    }));

    return { items, total };
  } catch (error) {
    throw new DatabaseError("Failed to list risk reports.", "LIST_REPORTS_FAILED");
  }
}

export interface RiskReportMetrics {
  totalAnalyzed: number;
  quarantinedCount: number;
  needsReviewCount: number;
  safeCount: number;
  flaggedAmount: number;
}

/** Return metrics over all persisted risk reports, independent of list pagination. */
export function getRiskReportMetrics(): RiskReportMetrics {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT
        COUNT(*) AS total_analyzed,
        SUM(CASE WHEN risk_level = 'QUARANTINE' THEN 1 ELSE 0 END) AS quarantined_count,
        SUM(CASE WHEN risk_level = 'NEEDS_REVIEW' THEN 1 ELSE 0 END) AS needs_review_count,
        SUM(CASE WHEN risk_level = 'SAFE' THEN 1 ELSE 0 END) AS safe_count,
        COALESCE(SUM(CASE WHEN risk_level = 'QUARANTINE' THEN amount ELSE 0 END), 0) AS flagged_amount
      FROM risk_reports
    `).get() as Record<string, number>;

    return {
      totalAnalyzed: Number(row.total_analyzed),
      quarantinedCount: Number(row.quarantined_count),
      needsReviewCount: Number(row.needs_review_count),
      safeCount: Number(row.safe_count),
      flaggedAmount: Number(row.flagged_amount),
    };
  } catch {
    throw new DatabaseError("Failed to load risk report metrics.", "REPORT_METRICS_READ_FAILED");
  }
}

/**
 * Update an existing risk report.
 */
export function updateRiskReport(
  id: string,
  updates: Partial<Pick<RiskReport, "risk_level" | "recommended_action">>
): RiskReport {
  const db = getDb();
  const existing = getRiskReportById(id);

  if (!existing) {
    throw new DatabaseError(`Risk report with ID ${id} not found.`, "REPORT_NOT_FOUND");
  }

  const newLevel = updates.risk_level ?? existing.risk_level;
  const newAction = updates.recommended_action ?? existing.recommended_action;
  const now = new Date().toISOString();

  try {
    const stmt = db.prepare(`
      UPDATE risk_reports
      SET risk_level = ?, recommended_action = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(newLevel, newAction, now, id);

    return {
      ...existing,
      risk_level: newLevel,
      recommended_action: newAction,
      updated_at: now,
    };
  } catch (error) {
    throw new DatabaseError("Failed to update risk report.", "UPDATE_REPORT_FAILED");
  }
}

/**
 * Create a quarantine item linked to a risk report.
 */
export function createQuarantineItem(
  item: Omit<QuarantineItem, "id" | "created_at" | "resolved_at">
): QuarantineItem {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const stmt = db.prepare(`
      INSERT INTO quarantine_items (id, risk_report_id, invoice_id, status, reason, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `);

    stmt.run(id, item.risk_report_id, item.invoice_id || null, item.status, item.reason, createdAt);

    return {
      id,
      risk_report_id: item.risk_report_id,
      invoice_id: item.invoice_id || null,
      status: item.status,
      reason: item.reason,
      created_at: createdAt,
      resolved_at: null,
    };
  } catch (error) {
    throw new DatabaseError("Failed to create quarantine item.", "CREATE_QUARANTINE_FAILED");
  }
}

/**
 * Update the status of quarantine item(s) by risk_report_id or item id.
 */
export function updateQuarantineStatus(
  reportIdOrItemId: string,
  status: QuarantineStatus,
  resolvedAt: string = new Date().toISOString()
): void {
  const db = getDb();

  try {
    const stmt = db.prepare(`
      UPDATE quarantine_items
      SET status = ?, resolved_at = ?
      WHERE id = ? OR risk_report_id = ?
    `);
    stmt.run(status, resolvedAt, reportIdOrItemId, reportIdOrItemId);
  } catch (error) {
    throw new DatabaseError("Failed to update quarantine status.", "UPDATE_QUARANTINE_FAILED");
  }
}

export interface QuarantineCancellationTarget {
  quarantineItemId: string;
  riskReportId: string;
  invoiceId: string | null;
  quarantineStatus: QuarantineStatus;
  paypalInvoiceStatus: string | null;
}

/** Resolve a local quarantine/report reference to the stored PayPal invoice ID. */
export function getQuarantineCancellationTarget(reference: string): QuarantineCancellationTarget | null {
  const db = getDb();

  try {
    const row = db.prepare(`
      SELECT
        q.id AS quarantine_item_id,
        q.risk_report_id,
        COALESCE(NULLIF(TRIM(q.invoice_id), ''), NULLIF(TRIM(r.invoice_id), ''), NULLIF(TRIM(i.paypal_invoice_id), '')) AS invoice_id,
        q.status AS quarantine_status,
        q.paypal_invoice_status
      FROM quarantine_items q
      JOIN risk_reports r ON r.id = q.risk_report_id
      LEFT JOIN invoices i ON i.paypal_invoice_id = r.invoice_id
      WHERE q.id = ? OR q.risk_report_id = ?
      ORDER BY CASE WHEN q.id = ? THEN 0 ELSE 1 END, q.created_at DESC
      LIMIT 1
    `).get(reference, reference, reference) as {
      quarantine_item_id: string;
      risk_report_id: string;
      invoice_id: string | null;
      quarantine_status: QuarantineStatus;
      paypal_invoice_status: string | null;
    } | undefined;

    if (!row) return null;
    return {
      quarantineItemId: row.quarantine_item_id,
      riskReportId: row.risk_report_id,
      invoiceId: row.invoice_id,
      quarantineStatus: row.quarantine_status,
      paypalInvoiceStatus: row.paypal_invoice_status,
    };
  } catch {
    throw new DatabaseError("Failed to resolve quarantine invoice.", "QUARANTINE_LOOKUP_FAILED");
  }
}

export interface QuarantineCancellationUpdate {
  quarantineItemId: string;
  attemptedAt: string;
  completedAt: string | null;
  response: string | null;
  error: string | null;
  invoiceStatus: string | null;
  succeeded: boolean;
}

/** Persist PayPal cancellation metadata; advance quarantine state only on confirmed success. */
export function updateQuarantineCancellation(input: QuarantineCancellationUpdate): void {
  const db = getDb();

  try {
    const result = db.prepare(`
      UPDATE quarantine_items
      SET paypal_action_attempted_at = ?,
          paypal_action_completed_at = ?,
          paypal_action_response = ?,
          paypal_action_error = ?,
          paypal_invoice_status = ?,
          status = CASE WHEN ? = 1 THEN 'REPORTED_SCAM' ELSE status END,
          resolved_at = CASE WHEN ? = 1 THEN ? ELSE resolved_at END
      WHERE id = ?
    `).run(
      input.attemptedAt,
      input.completedAt,
      input.response,
      input.error,
      input.invoiceStatus,
      input.succeeded ? 1 : 0,
      input.succeeded ? 1 : 0,
      input.completedAt,
      input.quarantineItemId
    );

    if (result.changes !== 1) {
      throw new DatabaseError("Quarantine item was not found for cancellation update.", "QUARANTINE_UPDATE_NOT_FOUND");
    }
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to update PayPal cancellation state.", "QUARANTINE_CANCELLATION_UPDATE_FAILED");
  }
}

/**
 * Save user feedback for a risk report (MARK_SAFE or REPORT_SCAM).
 */
export function saveUserFeedback(
  feedback: Omit<UserFeedback, "id" | "created_at">
): UserFeedback {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const stmt = db.prepare(`
      INSERT INTO user_feedback (id, risk_report_id, action, note, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, feedback.risk_report_id, feedback.action, feedback.note || null, createdAt);

    return {
      id,
      risk_report_id: feedback.risk_report_id,
      action: feedback.action,
      note: feedback.note || null,
      created_at: createdAt,
    };
  } catch (error) {
    throw new DatabaseError("Failed to record user feedback.", "SAVE_FEEDBACK_FAILED");
  }
}

/**
 * Check if sender has any prior MARK_SAFE feedback in user_feedback table.
 */
export function isKnownSender(sender: string): boolean {
  if (!sender || sender.trim().length === 0) return false;
  const db = getDb();

  try {
    const stmt = db.prepare(`
      SELECT 1 FROM user_feedback uf
      INNER JOIN risk_reports rr ON uf.risk_report_id = rr.id
      WHERE lower(trim(rr.sender)) = lower(trim(?)) AND uf.action = 'MARK_SAFE'
      LIMIT 1
    `);

    const result = stmt.get(sender);
    return Boolean(result);
  } catch (error) {
    return false;
  }
}

/**
 * Mark a webhook event as processed to prevent replay attacks / duplicate handling.
 * Returns true if event was newly recorded, false if already processed.
 */
export function markWebhookEventProcessed(eventId: string): boolean {
  if (!eventId) return false;
  const db = getDb();

  try {
    const stmt = db.prepare(`
      INSERT INTO processed_webhook_events (event_id, received_at)
      VALUES (?, ?)
    `);

    stmt.run(eventId, new Date().toISOString());
    return true;
  } catch (error) {
    // Unique constraint violation indicates duplicate event
    return false;
  }
}

export interface GmailConnectionRecord {
  email: string;
  encrypted_refresh_token: string;
  history_id: string;
  quarantine_label_id: string;
  review_label_id: string;
}

export interface GmailMessageRecord {
  status: "PROCESSING" | "ANALYZED" | "DONE" | "ERROR";
  report_id: string | null;
}

/** Return the single Gmail connection configured for this private deployment. */
export function getGmailConnection(): GmailConnectionRecord | null {
  const db = getDb();
  try {
    const row = db.prepare("SELECT email, encrypted_refresh_token, history_id, quarantine_label_id, review_label_id FROM gmail_connection WHERE id = 1")
      .get() as GmailConnectionRecord | undefined;
    return row || null;
  } catch {
    throw new DatabaseError("Failed to load Gmail connection.", "GMAIL_CONNECTION_READ_FAILED");
  }
}

/** Save the encrypted Gmail refresh token and initial history cursor. */
export function saveGmailConnection(connection: GmailConnectionRecord): void {
  const db = getDb();
  try {
    db.transaction(() => {
      const current = db.prepare("SELECT email FROM gmail_connection WHERE id = 1").get() as { email: string } | undefined;
      if (current && current.email.toLowerCase() !== connection.email.toLowerCase()) {
        db.prepare("DELETE FROM gmail_processed_messages").run();
      }
      db.prepare(`
        INSERT INTO gmail_connection
          (id, email, encrypted_refresh_token, history_id, quarantine_label_id, review_label_id, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          encrypted_refresh_token = excluded.encrypted_refresh_token,
          history_id = excluded.history_id,
          quarantine_label_id = excluded.quarantine_label_id,
          review_label_id = excluded.review_label_id,
          updated_at = excluded.updated_at
      `).run(
        connection.email,
        connection.encrypted_refresh_token,
        connection.history_id,
        connection.quarantine_label_id,
        connection.review_label_id,
        new Date().toISOString()
      );
    })();
  } catch {
    throw new DatabaseError("Failed to save Gmail connection.", "GMAIL_CONNECTION_SAVE_FAILED");
  }
}

/** Advance the Gmail history cursor only after every message in the batch succeeds. */
export function updateGmailHistoryId(historyId: string): void {
  const db = getDb();
  try {
    const result = db.prepare("UPDATE gmail_connection SET history_id = ?, updated_at = ? WHERE id = 1")
      .run(historyId, new Date().toISOString());
    if (result.changes !== 1) {
      throw new DatabaseError("Gmail connection is not configured.", "GMAIL_CONNECTION_NOT_FOUND");
    }
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to update Gmail history cursor.", "GMAIL_CURSOR_UPDATE_FAILED");
  }
}

/** Return processing state used to resume a Gmail message after a partial failure. */
export function getGmailMessageRecord(messageId: string): GmailMessageRecord | null {
  const db = getDb();
  try {
    const row = db.prepare("SELECT status, report_id FROM gmail_processed_messages WHERE message_id = ?")
      .get(messageId) as GmailMessageRecord | undefined;
    return row || null;
  } catch {
    throw new DatabaseError("Failed to read Gmail message state.", "GMAIL_MESSAGE_READ_FAILED");
  }
}

/** Claim a new or previously failed message; concurrent cron invocations cannot claim it twice. */
export function claimGmailMessage(messageId: string): boolean {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO gmail_processed_messages (message_id, status, report_id, updated_at)
      VALUES (?, 'PROCESSING', NULL, ?)
    `).run(messageId, now);
    if (inserted.changes === 1) return true;

    return db.prepare(`
      UPDATE gmail_processed_messages
      SET status = 'PROCESSING', updated_at = ?
      WHERE message_id = ? AND (
        status = 'ERROR' OR (
          status IN ('PROCESSING', 'ANALYZED') AND datetime(updated_at) < datetime('now', '-5 minutes')
        )
      )
    `).run(now, messageId).changes === 1;
  } catch {
    throw new DatabaseError("Failed to claim Gmail message.", "GMAIL_MESSAGE_CLAIM_FAILED");
  }
}

/** Persist the analysis reference before applying Gmail labels so retries do not duplicate reports. */
export function updateGmailMessageState(
  messageId: string,
  status: GmailMessageRecord["status"],
  reportId: string | null
): void {
  const db = getDb();
  try {
    const result = db.prepare(`
      UPDATE gmail_processed_messages
      SET status = ?, report_id = COALESCE(?, report_id), updated_at = ?
      WHERE message_id = ?
    `).run(status, reportId, new Date().toISOString(), messageId);
    if (result.changes !== 1) {
      throw new DatabaseError("Gmail message claim was not found.", "GMAIL_MESSAGE_NOT_FOUND");
    }
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to update Gmail message state.", "GMAIL_MESSAGE_UPDATE_FAILED");
  }
}

export type SecurityEventType = "EMAIL" | "URL" | "CALL";

export interface SecurityEventInput {
  eventType: SecurityEventType;
  source: string;
  externalId?: string;
  riskScore: number;
  category: string;
  action: string;
  summary: string;
  reasons: string[];
  urls?: string[];
  threatUrls?: Array<{ url: string; riskScore: number; category: string }>;
  sender?: string;
}

export interface SecurityEventRecord {
  id: string;
  event_type: SecurityEventType;
  source: string;
  external_id?: string;
  risk_score: number;
  category: string;
  action: string;
  summary: string;
  reasons: string[];
  urls: string[];
  sender: string | null;
  created_at: string;
}

function mapSecurityEvent(row: Record<string, unknown>, includeExternalId = false): SecurityEventRecord {
  let reasons: string[] = [];
  let urls: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(row.reasons));
    if (Array.isArray(parsed)) reasons = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    reasons = [];
  }
  try {
    const parsed: unknown = JSON.parse(String(row.urls));
    if (Array.isArray(parsed)) urls = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    urls = [];
  }

  return {
    id: String(row.id),
    event_type: row.event_type as SecurityEventType,
    source: String(row.source),
    ...(includeExternalId && typeof row.external_id === "string" ? { external_id: row.external_id } : {}),
    risk_score: Number(row.risk_score),
    category: String(row.category),
    action: String(row.action),
    summary: String(row.summary),
    reasons,
    urls,
    sender: typeof row.sender === "string" ? row.sender : null,
    created_at: String(row.created_at),
  };
}

/** Persist a normalized threat event; Gmail event IDs are unique for retry-safe processing. */
export function saveSecurityEvent(input: SecurityEventInput): SecurityEventRecord {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const riskScore = Math.max(0, Math.min(100, Math.round(input.riskScore)));
  const urls = Array.from(new Set(input.urls || [])).slice(0, 20);

  try {
    db.prepare(`
      INSERT OR IGNORE INTO security_events
        (id, event_type, source, external_id, risk_score, category, action, summary, reasons, urls, sender, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.eventType,
      input.source,
      input.externalId || null,
      riskScore,
      input.category.slice(0, 80),
      input.action.slice(0, 40),
      input.summary.slice(0, 500),
      JSON.stringify(input.reasons.slice(0, 10).map((reason) => reason.slice(0, 200))),
      JSON.stringify(urls),
      input.sender?.slice(0, 254) || null,
      createdAt
    );

    const row = input.externalId
      ? db.prepare("SELECT * FROM security_events WHERE external_id = ?").get(input.externalId) as Record<string, unknown> | undefined
      : db.prepare("SELECT * FROM security_events WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new DatabaseError("Security event could not be saved.", "SECURITY_EVENT_NOT_FOUND");

    const event = mapSecurityEvent(row, true);
    if (input.threatUrls?.length) {
      const upsertThreatUrl = db.prepare(`
        INSERT INTO threat_urls (normalized_url, domain, risk_score, category, source_event_id, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(normalized_url) DO UPDATE SET
          risk_score = MAX(threat_urls.risk_score, excluded.risk_score),
          last_seen = excluded.last_seen
      `);
      for (const threat of input.threatUrls.slice(0, 20)) {
        try {
          const parsed = new URL(threat.url);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            const normalizedUrl = `${parsed.origin}${parsed.pathname.replace(/\b\d{4,8}\b/g, "[REDACTED]")}`.slice(0, 2048);
            upsertThreatUrl.run(
              normalizedUrl,
              parsed.hostname.toLowerCase().slice(0, 253),
              Math.max(0, Math.min(100, Math.round(threat.riskScore))),
              threat.category.slice(0, 80),
              event.id,
              createdAt,
              createdAt
            );
          }
        } catch {
          continue;
        }
      }
    }

    return event;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to save security event.", "SAVE_SECURITY_EVENT_FAILED");
  }
}

/** Append an immutable audit entry for a security decision or user action. */
export function addSecurityAuditLog(eventId: string, action: string, details: string): void {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO security_audit_logs (id, security_event_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), eventId, action.slice(0, 60), details.slice(0, 500), new Date().toISOString());
  } catch {
    throw new DatabaseError("Failed to write the security audit log.", "SECURITY_AUDIT_WRITE_FAILED");
  }
}

/** Update the current event action after a reversible Gmail label is applied or restored. */
export function updateSecurityEventAction(eventId: string, action: string): void {
  const db = getDb();
  try {
    const result = db.prepare("UPDATE security_events SET action = ? WHERE id = ?")
      .run(action.slice(0, 40), eventId);
    if (result.changes !== 1) {
      throw new DatabaseError("Security event was not found.", "SECURITY_EVENT_NOT_FOUND");
    }
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to update security event action.", "SECURITY_EVENT_UPDATE_FAILED");
  }
}

/** Read an event including its private integration identifier for server-side restore operations. */
export function getSecurityEventById(eventId: string): SecurityEventRecord | null {
  const db = getDb();
  try {
    const row = db.prepare("SELECT * FROM security_events WHERE id = ?")
      .get(eventId) as Record<string, unknown> | undefined;
    return row ? mapSecurityEvent(row, true) : null;
  } catch {
    throw new DatabaseError("Failed to load security event.", "SECURITY_EVENT_READ_FAILED");
  }
}

/** Find a previously processed email event by its provider message ID. */
export function getSecurityEventByExternalId(externalId: string): SecurityEventRecord | null {
  const db = getDb();
  try {
    const row = db.prepare("SELECT * FROM security_events WHERE external_id = ?")
      .get(externalId) as Record<string, unknown> | undefined;
    return row ? mapSecurityEvent(row, true) : null;
  } catch {
    throw new DatabaseError("Failed to load security event.", "SECURITY_EVENT_READ_FAILED");
  }
}

export interface SecurityDashboardData {
  metrics: {
    emailsAnalyzed: number;
    threatsDetected: number;
    emailsQuarantined: number;
    otpAttemptsDetected: number;
    callsAnalyzed: number;
    maliciousUrlsDetected: number;
    paypalInvoicesVerified: number;
  };
  events: SecurityEventRecord[];
  auditLogs: Array<{
    id: string;
    security_event_id: string;
    event_type: SecurityEventType;
    action: string;
    details: string;
    created_at: string;
  }>;
}

/** Return dashboard statistics and recent persisted activity from SQLite. */
export function getSecurityDashboardData(): SecurityDashboardData {
  const db = getDb();
  try {
    const metrics = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM security_events WHERE event_type = 'EMAIL') AS emails_analyzed,
        (SELECT COUNT(*) FROM security_events WHERE risk_score >= 55) AS threats_detected,
        (SELECT COUNT(*) FROM security_audit_logs WHERE action = 'GMAIL_QUARANTINED') AS emails_quarantined,
        (SELECT COUNT(*) FROM security_events WHERE event_type = 'EMAIL' AND category = 'OTP_PHISHING') AS otp_attempts_detected,
        (SELECT COUNT(*) FROM security_events WHERE event_type = 'CALL') AS calls_analyzed,
        (SELECT COUNT(*) FROM threat_urls) AS malicious_urls_detected,
        (SELECT COUNT(*) FROM risk_reports WHERE paypal_verified = 1) AS paypal_invoices_verified
    `).get() as Record<string, number>;
    const eventRows = db.prepare(`
      SELECT id, event_type, source, external_id, risk_score, category, action, summary, reasons, urls, sender, created_at
      FROM security_events ORDER BY datetime(created_at) DESC LIMIT 20
    `).all() as Array<Record<string, unknown>>;
    const auditRows = db.prepare(`
      SELECT a.id, a.security_event_id, e.event_type, a.action, a.details, a.created_at
      FROM security_audit_logs a
      INNER JOIN security_events e ON e.id = a.security_event_id
      ORDER BY datetime(a.created_at) DESC LIMIT 20
    `).all() as Array<Record<string, unknown>>;

    return {
      metrics: {
        emailsAnalyzed: Number(metrics.emails_analyzed),
        threatsDetected: Number(metrics.threats_detected),
        emailsQuarantined: Number(metrics.emails_quarantined),
        otpAttemptsDetected: Number(metrics.otp_attempts_detected),
        callsAnalyzed: Number(metrics.calls_analyzed),
        maliciousUrlsDetected: Number(metrics.malicious_urls_detected),
        paypalInvoicesVerified: Number(metrics.paypal_invoices_verified),
      },
      events: eventRows.map((row) => mapSecurityEvent(row)),
      auditLogs: auditRows.map((row) => ({
        id: String(row.id),
        security_event_id: String(row.security_event_id),
        event_type: row.event_type as SecurityEventType,
        action: String(row.action),
        details: String(row.details),
        created_at: String(row.created_at),
      })),
    };
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to load security dashboard data.", "SECURITY_DASHBOARD_READ_FAILED");
  }
}
