import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncGmail } from "@/lib/gmail";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.PAYSHIELD_CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  if (!secret || secret.length < 32 || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Poll Gmail history; invoke every minute from a trusted private scheduler. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized.", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const result = await syncGmail();
    return NextResponse.json({ status: "ok", processed: result.processed }, { status: 200 });
  } catch (error) {
    logger.error("Gmail sync failed; history cursor was not advanced.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Gmail sync failed. The scheduler may retry safely.", code: "GMAIL_SYNC_FAILED" },
      { status: 503, headers: { "Retry-After": "60" } }
    );
  }
}
