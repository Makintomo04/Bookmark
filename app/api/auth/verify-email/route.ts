import prisma from "@/lib/db";
import { hashResetToken } from "@/lib/passwordResetToken";
import { verifyEmailIdentifier } from "@/lib/emailVerification";
import { clientIp, rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

const invalidLink = "This verification link is invalid or has expired.";

// POST, not GET: mail scanners prefetch links, so opening the link must not verify on its own.
export async function POST(req: Request) {
  const limit = rateLimit(`verify:ip:${clientIp(req.headers)}`, 20, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const body = await req.json().catch(() => null);
  const email = body?.email;
  const token = body?.token;
  if (!email || typeof email !== "string" || !token || typeof token !== "string") {
    return NextResponse.json({ error: invalidLink }, { status: 400 });
  }

  const identifier = verifyEmailIdentifier(email);
  const verificationToken = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token: hashResetToken(token) } },
  });
  if (!verificationToken || verificationToken.expires < new Date()) {
    return NextResponse.json({ error: invalidLink }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: invalidLink }, { status: 400 });
  }

  if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  }
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  return NextResponse.json({ message: "Email verified." });
}
