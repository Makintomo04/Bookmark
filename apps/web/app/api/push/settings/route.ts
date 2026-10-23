import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { PUSH_GROUPS, isPushGroup, type PushGroup } from "@bookmark/shared/push";

// Which kinds of push the reader switched off (packages/shared/src/push.ts PUSH_GROUPS). The bell keeps
// every notification either way.
const groups = Object.keys(PUSH_GROUPS) as PushGroup[];
const settingsOf = (off: string[]) => Object.fromEntries(groups.map((g) => [g, !off.includes(g)])) as Record<PushGroup, boolean>;

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json({ push: settingsOf(user.pushOff ?? []) });
}

// Body: { push: { circles?: boolean, follows?: boolean, recommendations?: boolean } }
export async function PATCH(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await req.json().catch(() => null);
  const changes = body?.push;
  if (!changes || typeof changes !== "object") return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const off = new Set((user.pushOff ?? []).filter(isPushGroup));
  for (const [group, on] of Object.entries(changes)) {
    if (!isPushGroup(group) || typeof on !== "boolean") return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
    if (on) off.delete(group);
    else off.add(group);
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data: { pushOff: Array.from(off) }, select: { pushOff: true } });
  return NextResponse.json({ push: settingsOf(updated.pushOff) });
}
