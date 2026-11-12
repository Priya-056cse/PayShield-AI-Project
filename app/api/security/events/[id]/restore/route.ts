import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityEventById } from "@/lib/db";
import { restoreGmailMessage } from "@/lib/gmail";
import { logger } from "@/lib/logger";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const rate = rateLimit(`gmail-restore:${getClientIp(request)}`, 10, 60_000);
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many Gmail restore requests. Try again shortly.", code: "RATE_LIMIT_EXCEEDED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.resetMs / 1000)) } }
    );
  }

  const eventId = z.string().uuid().safeParse(params.id);
  if (!eventId.success) {
    return NextResponse.json({ error: "Invalid security event ID.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const event = getSecurityEventById(eventId.data);
    if (!event) {
      return NextResponse.json({ error: "Security event was not found.", code: "EVENT_NOT_FOUND" }, { status: 404 });
    }
    if (event.event_type !== "EMAIL" || event.source !== "GMAIL") {
      return NextResponse.json(
        { error: "Only Gmail labels can be restored by this action.", code: "UNSUPPORTED_RESTORE" },
        { status: 409 }
      );
    }
    if (!["QUARANTINED", "REVIEW", "LABEL_ERROR"].includes(event.action)) {
      return NextResponse.json(
        { error: "This message has no active PayShield review or quarantine label.", code: "NOT_RESTORABLE" },
        { status: 409 }
      );
    }

    await restoreGmailMessage(eventId.data);
    return NextResponse.json({ success: true, action: "RESTORED" });
  } catch (error) {
    logger.error("Could not restore Gmail message labels.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Gmail labels could not be restored. Reconnect Gmail if access was revoked.", code: "RESTORE_FAILED" },
      { status: 502 }
    );
  }
}
