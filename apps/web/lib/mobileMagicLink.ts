import prisma from "@/lib/db";
import { findUserByEmail } from "@/lib/findUserByEmail";
import { sendMail } from "@/lib/mailer";
import { MAGIC_LINK_MAX_AGE_SECONDS } from "@/lib/magicLink";
import { generateResetToken, hashResetToken } from "@/lib/passwordResetToken";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { appUrl } from "@/lib/siteUrl";

// Email sign-in links for the app. The web's magic link goes through next-auth's callback, which sets a
// cookie the app can't use, so the app gets its own: the email links to /open/signin, which the phone
// hands to the app (a universal link, or the button there). Only the app's POST to
// /api/mobile/auth/magic-link/verify spends the token, so mail scanners that open links can't.
// Like the web's link, it creates the account when there isn't one.

// Prefixed so these never collide with the web's magic links, email verification or password resets,
// which share the VerificationToken collection.
const identifierFor = (email: string) => `mobile-link:${email}`;

export async function sendMobileMagicLink(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const limit = rateLimit(`magic-link:email:${email}`, 3, 60 * 60 * 1000);
  if (!limit.ok) throw new Error(tooManyRequestsMessage);

  const identifier = identifierFor(email);
  // Only the newest link works.
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  const { rawToken, hashedToken } = generateResetToken();
  await prisma.verificationToken.create({
    data: { identifier, token: hashedToken, expires: new Date(Date.now() + MAGIC_LINK_MAX_AGE_SECONDS * 1000) },
  });

  const link = `${appUrl}/open/signin?token=${rawToken}&email=${encodeURIComponent(email)}`;
  await sendMail({
    to: email,
    subject: "Your Bookmark sign-in link",
    text: `Open this on your phone to sign in to the Bookmark app: ${link}\nThis link expires in 1 hour and works once. If you didn't ask for it, ignore this email and nothing will happen.`,
    html: `<p>Here's your link to sign in to the Bookmark app. Open it on your phone.</p><p><a href="${link}">Sign in to Bookmark</a></p><p>This link expires in 1 hour and works once. If you didn't ask for it, ignore this email and nothing will happen.</p>`,
  });
}

// Spends the token and returns the reader, creating the account if the address has none. Null for a bad
// or expired link.
export async function consumeMobileMagicLink(rawEmail: string, token: string) {
  const email = rawEmail.trim().toLowerCase();
  const identifier = identifierFor(email);
  const row = await prisma.verificationToken.findUnique({ where: { identifier_token: { identifier, token: hashResetToken(token) } } });
  if (!row) return null;
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  if (row.expires < new Date()) return null;

  const existing = await findUserByEmail(email);
  if (!existing) {
    return { user: await prisma.user.create({ data: { email, emailVerified: new Date() } }), isNewUser: true };
  }
  if (existing.emailVerified) return { user: existing, isNewUser: false };
  // Opening the link proves the inbox is theirs. If the account was unverified and has a password,
  // whoever registered the address set it, maybe not this person, so it goes (as on the web).
  const user = await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: new Date(), hashedPassword: null } });
  return { user, isNewUser: false };
}
