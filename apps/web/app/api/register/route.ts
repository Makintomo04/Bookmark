import prisma from '@/lib/db'
import * as Sentry from '@sentry/nextjs';
import { sanitizeUser } from '@/lib/sanitizeUser';
import { registerSchema } from '@/lib/authSchemas';
import { sendVerificationEmail } from '@/lib/emailVerification';
import { findUserByEmail } from '@/lib/findUserByEmail';
import { safeCallbackPath } from '@/lib/callbackUrl';
import { clientIp, rateLimit, tooManyRequestsMessage } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';

export async function POST(req: Request) {
  const limit = rateLimit(`register:${clientIp(req.headers)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Email and password are required.' }, { status: 400 });
  }
  const { password } = parsed.data;
  // Stored lowercased so one address can't end up as two accounts that differ only by capitalisation.
  const email = parsed.data.email.toLowerCase();
  // Carried through the emailed link, so someone who signed up from an invite lands back on it.
  const callbackPath = safeCallbackPath(typeof body?.callbackUrl === 'string' ? body.callbackUrl : null);

  const existingUser = await findUserByEmail(email);
  // Signed up before but never confirmed (lost the email, or it expired): send a fresh link rather than a
  // dead end. The password isn't changed, or whoever knew the address could replace a pending sign-up's.
  if (existingUser?.email && existingUser.hashedPassword && !existingUser.emailVerified) {
    const byEmail = rateLimit(`resend-verify:email:${email}`, 3, 60 * 60 * 1000);
    if (!byEmail.ok) {
      return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429, headers: { 'Retry-After': String(byEmail.retryAfterSeconds) } });
    }
    try {
      await sendVerificationEmail(existingUser.email, callbackPath);
    } catch (error) {
      console.error('Failed to resend verification email', error);
      Sentry.captureException(error);
    }
    return NextResponse.json({ resent: true });
  }
  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists. Sign in instead, or reset your password.' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      hashedPassword
    },
  });
  // The account can't sign in until the emailed link is followed, so nobody can claim an inbox they don't own.
  try {
    await sendVerificationEmail(email, callbackPath);
  } catch (error) {
    // The account exists either way; the sign-in page can resend the link.
    console.error('Failed to send verification email', error);
    Sentry.captureException(error);
  }
  return NextResponse.json(sanitizeUser(user));
}
