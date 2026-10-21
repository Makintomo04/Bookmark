import prisma from '@/lib/db'
import { sanitizeUser } from '@/lib/sanitizeUser';
import { registerSchema } from '@/lib/authSchemas';
import { clientIp, rateLimit, tooManyRequestsMessage } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';

export async function POST(req: Request) {
  const limit = rateLimit(`register:${clientIp(req.headers)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: tooManyRequestsMessage }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  const parsed = registerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Email and password are required.' }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      hashedPassword
    },
  });
  return NextResponse.json(sanitizeUser(user));
}
