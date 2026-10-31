import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

// Stops the weekly email without signing in: the List-Unsubscribe-Post one-click from the inbox (RFC 8058),
// and the button on /email/unsubscribe. POST only, since link scanners open every GET in an email. The
// token is the reader's id signed (lib/unsubscribeToken.ts); an account deleted since just does nothing.
export async function POST(req: Request) {
  const userId = verifyUnsubscribeToken(new URL(req.url).searchParams.get("t"));
  if (!userId) return NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 400 });
  await prisma.user.updateMany({ where: { id: userId }, data: { weeklyEmail: false } });
  return NextResponse.json({ ok: true });
}
