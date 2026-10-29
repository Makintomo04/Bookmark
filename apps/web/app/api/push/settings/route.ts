import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { isStaffRole } from "@/lib/roles";
import { isPushGroup, pushGroupsFor, type PushGroup } from "@bookmark/shared/push";

// Which kinds of push the reader switched off (packages/shared/src/push.ts PUSH_GROUPS). The bell keeps
// every notification either way. Staff groups are only in a staff member's settings, on until they
// switch them off.
const settingsOf = (off: string[], isStaff: boolean) =>
  Object.fromEntries(pushGroupsFor(isStaff).map((g) => [g, !off.includes(g)])) as Partial<Record<PushGroup, boolean>>;

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json({ push: settingsOf(user.pushOff ?? [], isStaffRole(user)) });
}

// Body: { push: { circles?: boolean, follows?: boolean, recommendations?: boolean, ... } }
export async function PATCH(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await req.json().catch(() => null);
  const changes = body?.push;
  if (!changes || typeof changes !== "object") return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const isStaff = isStaffRole(user);
  const allowed = pushGroupsFor(isStaff);
  const off = new Set((user.pushOff ?? []).filter(isPushGroup));
  for (const [group, on] of Object.entries(changes)) {
    if (!isPushGroup(group) || !allowed.includes(group) || typeof on !== "boolean") return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
    if (on) off.delete(group);
    else off.add(group);
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data: { pushOff: Array.from(off) }, select: { pushOff: true } });
  return NextResponse.json({ push: settingsOf(updated.pushOff, isStaff) });
}
