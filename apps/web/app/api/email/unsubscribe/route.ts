import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { unsubscribeKindOf, verifyUnsubscribeToken, type UnsubscribeKind } from "@/lib/unsubscribeToken";

// Stops an email without signing in: the List-Unsubscribe-Post one-click from the inbox (RFC 8058), and the
// button on /email/unsubscribe. POST only, since link scanners open every GET in an email. The token is the
// reader's id and what it stops, signed (lib/unsubscribeToken.ts); an account deleted since does nothing.
const SWITCH_OFF: Record<UnsubscribeKind, { weeklyEmail: false } | { checkpointReminders: false }> = {
  weekly: { weeklyEmail: false },
  checkpoints: { checkpointReminders: false },
};

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("t");
  const kind = unsubscribeKindOf(token);
  const userId = kind && verifyUnsubscribeToken(token, kind);
  if (!kind || !userId) return NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 400 });
  await prisma.user.updateMany({ where: { id: userId }, data: SWITCH_OFF[kind] });
  return NextResponse.json({ ok: true, kind });
}
