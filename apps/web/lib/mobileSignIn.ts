import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { platformOf, startMobileSession } from "@/lib/mobileAuth";
import { mobileSessionStore } from "@/lib/mobileAuthStore";
import { isSuspended, SUSPENDED, SUSPENDED_MESSAGE } from "@/lib/suspension";

// What every app sign-in route answers with: the tokens (lib/mobileAuth.ts) and just enough of the
// account for the app to choose its first screen. Onboarding is done once there's a username and a
// colour, the same test the web's home page uses.
export async function mobileSignInResponse(user: User, opts: { platform?: unknown; isNewUser?: boolean } = {}) {
  if (isSuspended(user)) return mobileAuthError(SUSPENDED_MESSAGE, 403, SUSPENDED);
  const tokens = await startMobileSession(user, platformOf(opts.platform), mobileSessionStore);
  return NextResponse.json({
    ...tokens,
    isNewUser: !!opts.isNewUser,
    user: { id: user.id, email: user.email, username: user.username, onboarded: !!user.favColour && !!user.username },
  });
}

export function mobileAuthError(error: string, status: number, code?: string) {
  return NextResponse.json({ error, ...(code && { code }) }, { status });
}
