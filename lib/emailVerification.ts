import prisma from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { generateResetToken } from "@/lib/passwordResetToken";
import { appUrl } from "@/lib/siteUrl";

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Prefixed so verification tokens never collide with password-reset tokens or NextAuth magic links,
// which share the VerificationToken collection keyed by the bare email.
export function verifyEmailIdentifier(email: string) {
  return `verify-email:${email}`;
}

// callbackPath is where the reader was headed (e.g. an invite); the verify page passes it on to sign-in.
export async function sendVerificationEmail(email: string, callbackPath?: string | null) {
  const identifier = verifyEmailIdentifier(email);
  // Only the newest link works.
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  const { rawToken, hashedToken } = generateResetToken();
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashedToken,
      expires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    },
  });

  const callbackParam = callbackPath ? `&callbackUrl=${encodeURIComponent(callbackPath)}` : "";
  const verifyUrl = `${appUrl}/verify-email?token=${rawToken}&email=${encodeURIComponent(email)}${callbackParam}`;

  await sendMail({
    to: email,
    subject: "Confirm your Bookmark email",
    text: `Confirm your email to finish creating your Bookmark account: ${verifyUrl}\nThis link expires in 24 hours. If you didn't sign up for Bookmark, ignore this email and nothing will happen.`,
    html: `<p>Confirm your email to finish creating your Bookmark account.</p><p><a href="${verifyUrl}">Confirm my email</a></p><p>This link expires in 24 hours. If you didn't sign up for Bookmark, ignore this email and nothing will happen.</p>`,
  });
}
