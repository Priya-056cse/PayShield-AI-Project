import { NextResponse } from "next/server";
import { getGmailStatus } from "@/lib/gmail";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Return Gmail connection status without exposing stored tokens or mailbox contents. */
export async function GET() {
  try {
    return NextResponse.json(getGmailStatus(), { status: 200 });
  } catch (error) {
    logger.error("Could not load Gmail connection status.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Gmail connection status is unavailable.", code: "GMAIL_STATUS_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
