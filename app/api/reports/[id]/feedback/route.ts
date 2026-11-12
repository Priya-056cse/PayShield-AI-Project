import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRiskReportById,
  updateRiskReport,
  saveUserFeedback,
  updateQuarantineStatus,
  createQuarantineItem,
} from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const feedbackSchema = z.object({
  action: z.enum(["MARK_SAFE", "REPORT_SCAM"], {
    errorMap: () => ({ message: "Action must be either 'MARK_SAFE' or 'REPORT_SCAM'." }),
  }),
  note: z.string().max(500, "Note cannot exceed 500 characters.").optional(),
});

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * POST /api/reports/[id]/feedback
 * Records user feedback (MARK_SAFE or REPORT_SCAM), updating report and quarantine state.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const reportId = params?.id;
    if (!reportId) {
      return NextResponse.json(
        { error: "Report ID is required in URL path.", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    // 1. Rate limiting (30 requests/minute per IP)
    const clientIp = getClientIp(req);
    const rateCheck = rateLimit(`feedback:${clientIp}`, 30, 60 * 1000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { error: "Too many feedback submissions. Please wait a moment.", code: "RATE_LIMIT_EXCEEDED" },
        { status: 429 }
      );
    }

    // 2. Locate report in SQLite
    const report = getRiskReportById(reportId);
    if (!report) {
      return NextResponse.json(
        { error: `Risk report with ID ${reportId} not found.`, code: "REPORT_NOT_FOUND" },
        { status: 404 }
      );
    }

    // 3. Parse and validate body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON format in request body.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const validation = feedbackSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || "Validation failed.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { action, note } = validation.data;

    // 4. Record user feedback
    saveUserFeedback({
      risk_report_id: reportId,
      action,
      note: note || null,
    });

    // 5. Update state according to action
    let updatedReport;
    if (action === "MARK_SAFE") {
      updatedReport = updateRiskReport(reportId, {
        risk_level: "SAFE",
        recommended_action: "Approved & marked safe by user authorization.",
      });
      updateQuarantineStatus(reportId, "RELEASED");
      logger.info(`Report ${reportId} marked SAFE by user.`);
    } else {
      updatedReport = updateRiskReport(reportId, {
        risk_level: "QUARANTINE",
        recommended_action: "Reported as verified scam by user. Do not pay.",
      });
      updateQuarantineStatus(reportId, "REPORTED_SCAM");
      logger.info(`Report ${reportId} confirmed as REPORTED_SCAM by user.`);
    }

    return NextResponse.json(
      {
        success: true,
        report: updatedReport,
        action,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Error in POST /api/reports/[id]/feedback:", error);
    return NextResponse.json(
      { error: "Failed to record feedback.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
