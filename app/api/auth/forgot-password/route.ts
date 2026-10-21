import prisma from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { generateResetToken } from "@/lib/passwordResetToken";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/siteUrl";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const SENT_MESSAGE = "If an account exists for that email, a reset link has been sent.";

const PROVIDER_NAMES: Record<string, string> = { google: "Google", github: "GitHub" };

// Accounts made with Google or GitHub have no password to reset. Asking for one used to send nothing,
// which looked broken; instead, say how they sign in. Same response either way, so the endpoint still
// can't be used to find out which emails have accounts.
async function sendSignInReminder(email: string, userId: string) {
  const accounts = await prisma.account.findMany({ where: { userId }, select: { provider: true } });
  const providers = Array.from(new Set(accounts.map((a) => PROVIDER_NAMES[a.provider]).filter(Boolean)));
  const how = providers.length ? `with ${providers.join(" or ")}` : "without a password";
  const button = providers.length ? `the "Continue with ${providers[0]}" button` : "the way you first signed up";
  const signInUrl = `${appUrl}/signin`;

  await sendMail({
    to: email,
    subject: "How to sign in to Bookmark",
    text: `Someone asked to reset the password for your Bookmark account, but you sign in ${how}, so there's no password to reset.
Sign in with ${button}: ${signInUrl}
If you didn't ask for this, you can ignore this email.`,
    html: `<p>Someone asked to reset the password for your Bookmark account, but you sign in ${how}, so there's no password to reset.</p><p><a href="${signInUrl}">Sign in to Bookmark</a> using ${button}.</p><p>If you didn't ask for this, you can ignore this email.</p>`,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = body?.email;
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  // Per IP to stop scripted floods, and per address so one inbox can't be spammed with reset mail.
  const byIp = rateLimit(`forgot:ip:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
  const byEmail = rateLimit(`forgot:email:${email.toLowerCase()}`, 3, 60 * 60 * 1000);
  if (!byIp.ok || !byEmail.ok) {
    const retryAfter = Math.max(byIp.ok ? 0 : byIp.retryAfterSeconds, byEmail.ok ? 0 : byEmail.retryAfterSeconds);
    return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Always respond with success so this endpoint can't be used to
  // enumerate which emails have an account. The logs say which case ran, never the address.
  if (!user) {
    console.info("forgot-password: no account for this email; nothing sent");
    return NextResponse.json({ message: SENT_MESSAGE });
  }
  if (!user.hashedPassword) {
    await sendSignInReminder(email, user.id);
    console.info("forgot-password: account has no password; sent a sign-in reminder");
    return NextResponse.json({ message: SENT_MESSAGE });
  }

  // Clear any previous outstanding reset tokens for this email.
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  const { rawToken, hashedToken } = generateResetToken();
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: hashedToken,
      expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const resetUrl = `${appUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

  await sendMail({
    to: email,
    subject: "Reset your Bookmark password",
    text: `Reset your password: ${resetUrl}\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    html: `<p>Someone requested a password reset for your Bookmark account.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });

  console.info("forgot-password: reset link sent");
  return NextResponse.json({ message: SENT_MESSAGE });
}
