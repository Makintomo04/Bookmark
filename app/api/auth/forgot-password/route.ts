import prisma from "@/lib/db";
import { findUserByEmail } from "@/lib/findUserByEmail";
import { sendMail } from "@/lib/mailer";
import { generateResetToken } from "@/lib/passwordResetToken";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/siteUrl";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const typedEmail = typeof body?.email === "string" ? body.email.trim() : "";
  if (!typedEmail) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  // Per IP to stop scripted floods, and per address so one inbox can't be spammed with reset mail.
  const byIp = rateLimit(`forgot:ip:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
  const byEmail = rateLimit(`forgot:email:${typedEmail.toLowerCase()}`, 3, 60 * 60 * 1000);
  if (!byIp.ok || !byEmail.ok) {
    const retryAfter = Math.max(byIp.ok ? 0 : byIp.retryAfterSeconds, byEmail.ok ? 0 : byEmail.retryAfterSeconds);
    return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const user = await findUserByEmail(typedEmail);

  // Always respond with success so this endpoint can't be used to
  // enumerate which emails have an account.
  if (!user || !user.email || !user.hashedPassword) {
    return NextResponse.json({ message: "If an account exists for that email, a reset link has been sent." });
  }
  // The token, link and reset all key off the email as stored, whatever case it was typed in.
  const email = user.email;

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

  return NextResponse.json({ message: "If an account exists for that email, a reset link has been sent." });
}
