import prisma from '@/lib/db'
import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
export async function POST(req:Request, res:Response) {
  const body = await req.json();
  const { email, password } = body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      hashedPassword
    },
  });
  return NextResponse.json(user);
}