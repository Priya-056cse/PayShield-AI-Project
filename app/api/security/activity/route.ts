import { NextResponse } from "next/server";
import { getSecurityDashboardData } from "@/lib/db";
import { getGmailStatus } from "@/lib/gmail";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = getSecurityDashboardData();
    const gmail = getGmailStatus();
    const schedulerConfigured = Boolean(
      process.env.PAYSHIELD_CRON_SECRET && process.env.PAYSHIELD_CRON_SECRET.length >= 32
    );
    return NextResponse.json({
      ...data,
      gmail: {
        connected: gmail.connected,
        email: gmail.email,
        schedulerConfigured,
        note: gmail.connected
          ? "Gmail history polling runs only when a trusted external scheduler calls the cron route."
          : "Connect Gmail to enable authorized message analysis.",
      },
    });
  } catch (error) {
    logger.error("Could not load security activity.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Security activity is unavailable.", code: "SECURITY_ACTIVITY_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
