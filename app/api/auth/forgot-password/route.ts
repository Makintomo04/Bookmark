import prisma from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { generateResetToken } from "@/lib/passwordResetToken";
import { NextResponse } from "next/server";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: Request) {
  const body = await req.json();
  const { email } = body;
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Always respond with success so this endpoint can't be used to
  // enumerate which emails have an account.
  if (!user || !user.hashedPassword) {
    return NextResponse.json({ message: "If an account exists for that email, a reset link has been sent." });
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

  const resetUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

  await sendMail({
    to: email,
    subject: "Reset your Bookmark password",
    text: `Reset your password: ${resetUrl}\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    html: `<p>Someone requested a password reset for your Bookmark account.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });

  return NextResponse.json({ message: "If an account exists for that email, a reset link has been sent." });
}
