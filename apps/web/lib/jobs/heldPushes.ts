import prisma from "@/lib/db";
import { isQuietFor } from "@/lib/notifications";
import { sendPushes } from "@/lib/push";
import type { JobContext } from "./common";

// Pushes held through the reader's quiet hours (lib/notifications.ts): book news a cron found overnight is in
// the bell already, and its push goes out on the first tick after quiet hours end. One the reader has read
// in the bell meanwhile isn't pushed, nor is one held for more than a day (stale news on a lock screen).
// Each row is cleared before its push is sent, so an overlapping tick can't send it twice: one push too few
// is better than two, as for the ledger (./ledger.ts).

// Rows a tick looks at; the rest wait for the next tick.
export const HELD_PUSH_BATCH = 2000;
export const HELD_PUSH_MAX_HOURS = 24;

export interface HeldRow {
  id: string;
  userId: string;
  read: boolean;
  createdAt: Date;
}

// Which held rows to push now, and which to drop without a push. The rest stay held. No database.
export function heldPushPlan<T extends HeldRow>(rows: T[], quiet: (userId: string) => boolean, now: Date): { push: T[]; drop: T[] } {
  const push: T[] = [];
  const drop: T[] = [];
  for (const row of rows) {
    if (row.read || now.getTime() - row.createdAt.getTime() > HELD_PUSH_MAX_HOURS * 60 * 60 * 1000) drop.push(row);
    else if (!quiet(row.userId)) push.push(row);
  }
  return { push, drop };
}

export async function runHeldPushes(ctx: JobContext): Promise<{ heldPushes: number }> {
  const rows = await prisma.notification.findMany({
    where: { pushHeld: true },
    orderBy: { createdAt: "asc" },
    take: HELD_PUSH_BATCH,
    select: { id: true, userId: true, actorId: true, type: true, bookId: true, buddyReadId: true, count: true, workId: true, message: true, read: true, createdAt: true },
  });
  if (rows.length === 0) return { heldPushes: 0 };
  const readers = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(rows.map((r) => r.userId))) } },
    select: { id: true, timeZone: true, quietStartMinute: true, quietEndMinute: true },
  });
  const byId = new Map(readers.map((r) => [r.id, r]));
  // A reader who's gone (account closed) has nothing to push to: dropped with the stale ones.
  const { push, drop } = heldPushPlan(rows, (userId) => { const r = byId.get(userId); return !r || isQuietFor(r, ctx.now); }, ctx.now);
  const gone = rows.filter((r) => !byId.has(r.userId));
  const cleared = [...push, ...drop, ...gone];
  if (cleared.length) await prisma.notification.updateMany({ where: { id: { in: cleared.map((r) => r.id) } }, data: { pushHeld: null } });
  await sendPushes(push);
  return { heldPushes: push.length };
}
