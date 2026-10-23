import { consumeMobileMagicLink } from "@/lib/mobileMagicLink";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { mobileAuthError, mobileSignInResponse } from "@/lib/mobileSignIn";

// The app opened an emailed sign-in link: spend it and sign in.
export async function POST(req: Request) {
  const limit = rateLimit(`verify:ip:${clientIp(req.headers)}`, 20, 15 * 60 * 1000);
  if (!limit.ok) return mobileAuthError(tooManyRequestsMessage, 429);
  const body = await req.json().catch(() => null);
  if (typeof body?.email !== "string" || typeof body?.token !== "string") return mobileAuthError("This sign-in link is incomplete.", 400);
  const result = await consumeMobileMagicLink(body.email, body.token);
  if (!result) return mobileAuthError("This sign-in link is invalid or has expired. Ask for a new one.", 401);
  return mobileSignInResponse(result.user, { platform: body?.platform, isNewUser: result.isNewUser });
}
