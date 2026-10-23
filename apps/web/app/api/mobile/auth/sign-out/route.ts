import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { endMobileSession } from "@/lib/mobileAuth";
import { mobileSessionStore } from "@/lib/mobileAuthStore";

// Signing out on the phone ends its session and stops pushes to it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.refreshToken === "string") await endMobileSession(body.refreshToken, mobileSessionStore);
  if (typeof body?.pushToken === "string") await prisma.pushToken.deleteMany({ where: { token: body.pushToken } });
  return NextResponse.json({ signedOut: true });
}
