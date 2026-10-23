import { NextResponse } from "next/server";
import { refreshMobileSession } from "@/lib/mobileAuth";
import { emailOfUser, mobileSessionStore } from "@/lib/mobileAuthStore";
import { mobileAuthError } from "@/lib/mobileSignIn";

// Trades a refresh token for a new access token and a new refresh token. Each refresh token works once.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.refreshToken !== "string") return mobileAuthError("Missing the refresh token.", 400);
  const result = await refreshMobileSession(body.refreshToken, mobileSessionStore, { emailOf: emailOfUser });
  if (!result.ok) {
    if (result.reason === "reused") console.warn("[mobile-auth] a rotated refresh token was used again; the session was ended");
    return mobileAuthError("Your session has ended. Sign in again.", 401, result.reason);
  }
  return NextResponse.json(result.tokens);
}
