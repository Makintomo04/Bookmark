import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMobileMagicLink } from "@/lib/mobileMagicLink";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { mobileAuthError } from "@/lib/mobileSignIn";

const emailSchema = z.string().trim().email();

// Emails an app sign-in link. Answers the same whether or not the address has an account.
export async function POST(req: Request) {
  const byIp = rateLimit(`mobile-magic-link:ip:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
  if (!byIp.ok) return mobileAuthError(tooManyRequestsMessage, 429);
  const body = await req.json().catch(() => null);
  const email = emailSchema.safeParse(body?.email);
  if (!email.success) return mobileAuthError("Enter a valid email address.", 400);
  try {
    await sendMobileMagicLink(email.data);
  } catch (error) {
    if (error instanceof Error && error.message === tooManyRequestsMessage) return mobileAuthError(error.message, 429);
    console.error("[mobile-auth] couldn't send the sign-in link", error);
    return mobileAuthError("We couldn't send the email. Try again in a minute.", 500);
  }
  return NextResponse.json({ sent: true });
}
