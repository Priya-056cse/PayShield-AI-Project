import { NextResponse } from "next/server";
import { createGmailAuthorization, OAUTH_COOKIE } from "@/lib/gmail";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Start Gmail OAuth; protect this route behind the deployment's private access proxy. */
export async function GET() {
  try {
    const { url, cookieValue } = createGmailAuthorization();
    const response = NextResponse.redirect(url);
    response.cookies.set(OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/gmail/callback",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    logger.error("Could not start Gmail OAuth.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Gmail connection is not configured.", code: "GMAIL_NOT_CONFIGURED" },
      { status: 503 }
    );
  }
}
