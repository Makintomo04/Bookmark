import { verifyAppleIdentityToken } from "@/lib/idTokens";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { AccountNotLinkedError, signInWithIdentity } from "@/lib/socialSignIn";
import { mobileAuthError, mobileSignInResponse } from "@/lib/mobileSignIn";

// Sign in with Apple on the phone. The app sends the identity token, the raw nonce it hashed for Apple,
// and the name Apple shares on the first sign-in only.
export async function POST(req: Request) {
  const limit = rateLimit(`mobile-social:ip:${clientIp(req.headers)}`, 30, 15 * 60 * 1000);
  if (!limit.ok) return mobileAuthError(tooManyRequestsMessage, 429);
  const body = await req.json().catch(() => null);
  if (typeof body?.identityToken !== "string") return mobileAuthError("Missing the Apple token.", 400);
  const nonce = typeof body?.nonce === "string" ? body.nonce : null;
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim().slice(0, 80) || null : null;

  let identity;
  try {
    identity = await verifyAppleIdentityToken(body.identityToken, nonce);
  } catch (error) {
    console.warn("[mobile-auth] apple token rejected", error instanceof Error ? error.message : error);
    return mobileAuthError("Sign in with Apple didn't work. Try again.", 401);
  }
  try {
    const { user, isNewUser } = await signInWithIdentity("apple", identity, fullName);
    return mobileSignInResponse(user, { platform: body?.platform, isNewUser });
  } catch (error) {
    if (error instanceof AccountNotLinkedError) return mobileAuthError(error.message, 409, "OAuthAccountNotLinked");
    return mobileAuthError(error instanceof Error ? error.message : "Sign in with Apple didn't work.", 400);
  }
}
