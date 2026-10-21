import prisma from "@/lib/db";
import { hashResetToken } from "@/lib/passwordResetToken";
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { passwordSchema } from "@/lib/authSchemas";

export async function POST(req: Request) {
  const body = await req.json();
  const { email, token, password } = body;
  if (!email || !token || !password) {
    return NextResponse.json({ error: "Email, token and new password are required." }, { status: 400 });
  }
  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) {
    return NextResponse.json({ error: parsedPassword.error.issues[0].message }, { status: 400 });
  }

  const hashedToken = hashResetToken(token);
  const verificationToken = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token: hashedToken } },
  });

  if (!verificationToken || verificationToken.expires < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(parsedPassword.data, 10);
  await prisma.user.update({
    where: { id: user.id },
    // Following the emailed link proves the reader owns this inbox.
    data: { hashedPassword, emailVerified: user.emailVerified ?? new Date() },
  });

  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  return NextResponse.json({ message: "Password updated." });
}
