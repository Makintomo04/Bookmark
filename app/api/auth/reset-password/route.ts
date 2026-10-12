import prisma from "@/lib/db";
import { hashResetToken } from "@/lib/passwordResetToken";
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

export async function POST(req: Request) {
  const body = await req.json();
  const { email, token, password } = body;
  if (!email || !token || !password) {
    return NextResponse.json({ error: "Email, token and new password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
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

  const hashedPassword = bcrypt.hashSync(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { hashedPassword },
  });

  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  return NextResponse.json({ message: "Password updated." });
}
