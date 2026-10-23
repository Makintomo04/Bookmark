import { sendVerificationEmail } from "@/lib/emailVerification";
import { emailSchema } from "@/lib/authSchemas";
import { findUserByEmail } from "@/lib/findUserByEmail";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

const sentMessage = "If that account still needs verifying, we've sent a new link.";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = emailSchema.safeParse(body?.email);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Email is required." }, { status: 400 });
  }
  const email = parsed.data;

  // Per IP to stop scripted floods, and per address so one inbox can't be spammed.
  const byIp = rateLimit(`resend-verify:ip:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
  const byEmail = rateLimit(`resend-verify:email:${email.toLowerCase()}`, 3, 60 * 60 * 1000);
  if (!byIp.ok || !byEmail.ok) {
    const retryAfter = Math.max(byIp.ok ? 0 : byIp.retryAfterSeconds, byEmail.ok ? 0 : byEmail.retryAfterSeconds);
    return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const user = await findUserByEmail(email);
  // Same response either way, so this can't be used to find out which emails have accounts.
  if (user?.email && user.hashedPassword && !user.emailVerified) {
    await sendVerificationEmail(user.email);
  }
  return NextResponse.json({ message: sentMessage });
}
