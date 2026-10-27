import { checkPasswordSignIn } from "@/lib/passwordSignIn";
import { EMAIL_NOT_VERIFIED } from "@/lib/authSchemas";
import { tooManyRequestsMessage } from "@/lib/rateLimit";
import { mobileAuthError, mobileSignInResponse } from "@/lib/mobileSignIn";
import { SUSPENDED, SUSPENDED_MESSAGE } from "@/lib/suspension";

// The app's email and password sign-in: the web's credentials check, answered with tokens.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return mobileAuthError("Enter your email and password.", 400);

  try {
    const user = await checkPasswordSignIn(email, password, req.headers);
    return mobileSignInResponse(user, { platform: body?.platform });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't sign you in.";
    if (message === tooManyRequestsMessage) return mobileAuthError(message, 429);
    if (message === SUSPENDED_MESSAGE) return mobileAuthError(message, 403, SUSPENDED);
    if (message === EMAIL_NOT_VERIFIED) return mobileAuthError("Confirm your email first. We can send the link again.", 403, EMAIL_NOT_VERIFIED);
    return mobileAuthError(message, 401);
  }
}
