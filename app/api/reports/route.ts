import { NextRequest, NextResponse } from "next/server";
import { getRiskReportMetrics, listRiskReports } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { RiskLevel } from "@/types/invoice";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports
 * Lists stored risk analysis reports with search, filtering, and pagination.
 * Parameterized SQL only via lib/db.ts.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const riskLevelParam = searchParams.get("risk_level");
    const qParam = searchParams.get("q") || undefined;
    const limitParam = parseInt(searchParams.get("limit") || "50", 10);
    const offsetParam = parseInt(searchParams.get("offset") || "0", 10);

    const validLevels: RiskLevel[] = ["SAFE", "NEEDS_REVIEW", "QUARANTINE"];
    let risk_level: RiskLevel | undefined = undefined;

    if (riskLevelParam && validLevels.includes(riskLevelParam.toUpperCase() as RiskLevel)) {
      risk_level = riskLevelParam.toUpperCase() as RiskLevel;
    }

    const limit = Math.min(Math.max(isNaN(limitParam) ? 50 : limitParam, 1), 100);
    const offset = Math.max(isNaN(offsetParam) ? 0 : offsetParam, 0);

    const result = listRiskReports({
      risk_level,
      q: qParam,
      limit,
      offset,
    });
    const metrics = getRiskReportMetrics();

    return NextResponse.json({ ...result, metrics }, { status: 200 });
  } catch (error) {
    logger.error("Error in GET /api/reports:", error);
    return NextResponse.json(
      { error: "Failed to retrieve risk reports.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
