import { verifyGoogleIdToken } from "@/lib/idTokens";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { AccountNotLinkedError, signInWithIdentity } from "@/lib/socialSignIn";
import { mobileAuthError, mobileSignInResponse } from "@/lib/mobileSignIn";

// Native Google sign-in: the app sends the ID token Google gave it.
export async function POST(req: Request) {
  const limit = rateLimit(`mobile-social:ip:${clientIp(req.headers)}`, 30, 15 * 60 * 1000);
  if (!limit.ok) return mobileAuthError(tooManyRequestsMessage, 429);
  const body = await req.json().catch(() => null);
  if (typeof body?.idToken !== "string") return mobileAuthError("Missing the Google token.", 400);

  let identity;
  try {
    identity = await verifyGoogleIdToken(body.idToken);
  } catch (error) {
    console.warn("[mobile-auth] google token rejected", error instanceof Error ? error.message : error);
    return mobileAuthError("Google sign-in didn't work. Try again.", 401);
  }
  try {
    const { user, isNewUser } = await signInWithIdentity("google", identity);
    return mobileSignInResponse(user, { platform: body?.platform, isNewUser });
  } catch (error) {
    if (error instanceof AccountNotLinkedError) return mobileAuthError(error.message, 409, "OAuthAccountNotLinked");
    return mobileAuthError(error instanceof Error ? error.message : "Google sign-in didn't work.", 400);
  }
}
