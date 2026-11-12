import { NextRequest, NextResponse } from "next/server";
import { finishGmailAuthorization, OAUTH_COOKIE, verifyGmailOAuthState } from "@/lib/gmail";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Complete the Gmail OAuth callback and discard transient state on every outcome. */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/gmail/callback",
    maxAge: 0,
  });

  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    response.cookies.set("payshield-gmail-result", "access_denied", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
    return response;
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const stateCookie = request.cookies.get(OAUTH_COOKIE)?.value;
  let stateValid = false;
  try {
    stateValid = Boolean(state && verifyGmailOAuthState(state, stateCookie));
  } catch (error) {
    logger.error("Gmail OAuth callback configuration is unavailable.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
  if (!code || code.length > 4096 || !stateValid) {
    logger.warn("Rejected Gmail OAuth callback because the state or authorization code was invalid.");
    response.cookies.set("payshield-gmail-result", "invalid_callback", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
    return response;
  }

  try {
    await finishGmailAuthorization(code);
    response.cookies.set("payshield-gmail-result", "connected", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
  } catch (error) {
    logger.error("Gmail OAuth completion failed.", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    response.cookies.set("payshield-gmail-result", "connection_failed", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
  }
  return response;
}
