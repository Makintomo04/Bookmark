import prisma from "@/lib/db";
import { isQuietFor } from "@/lib/notifications";
import { sendPushes, type PushableNotification } from "@/lib/push";
import { pageArgs, pages, type JobContext } from "./common";

// Pushes held through the reader's quiet hours (lib/notifications.ts): book news a cron found overnight is in
// the bell already, and its push goes out on the first tick after quiet hours end. One the reader has read
// in the bell meanwhile isn't pushed, nor is one held for more than a day (stale news on a lock screen).
// Each row is cleared before its push is sent, so an overlapping tick can't send it twice: one push too few
// is better than two, as for the ledger (./ledger.ts).

// A tick reads every held row, a page at a time (./common.ts pages) until its deadline, so readers still in
// quiet hours (a Sydney-heavy following overnight) never stand in front of ones whose quiet hours have ended.
// Rows they leave held are passed over and read again next tick.
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
  let heldPushes = 0;
  const load = (after: string | undefined) => prisma.notification.findMany({
    where: { pushHeld: true },
    ...pageArgs(after),
    select: { id: true, userId: true, actorId: true, type: true, bookId: true, buddyReadId: true, count: true, workId: true, message: true, read: true, createdAt: true },
  });
  for await (const rows of pages(ctx, load)) heldPushes += await pushHeldPage(rows, ctx.now);
  return { heldPushes };
}

async function pushHeldPage<T extends HeldRow & PushableNotification>(rows: T[], now: Date): Promise<number> {
  const readers = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(rows.map((r) => r.userId))) } },
    select: { id: true, timeZone: true, quietStartMinute: true, quietEndMinute: true },
  });
  const byId = new Map(readers.map((r) => [r.id, r]));
  // A reader who's gone (account closed) has nothing to push to: dropped with the stale ones.
  const { push, drop } = heldPushPlan(rows, (userId) => { const r = byId.get(userId); return !r || isQuietFor(r, now); }, now);
  const gone = rows.filter((r) => !byId.has(r.userId));
  const cleared = [...push, ...drop, ...gone];
  if (cleared.length) await prisma.notification.updateMany({ where: { id: { in: cleared.map((r) => r.id) } }, data: { pushHeld: null } });
  await sendPushes(push);
  return push.length;
}
