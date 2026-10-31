import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { sendPushes } from "@/lib/push";
import { zoneOf } from "@/lib/jobs/common";
import { heldInQuietHours } from "@bookmark/shared/push";
import { inQuietHours, localClock, quietHoursOf } from "@bookmark/shared/reminders";

// Writing a notification for the bell, and pushing it to the recipient's phone when it's a kind that's
// pushed (packages/shared/src/push.ts). Use these rather than prisma.notification.create, so a new kind
// of notification can't forget the push.
//
// Book news a cron finds (a new book in a series, one announced) goes in the bell at once, but a reader in
// their quiet hours gets the push when those end: the row is marked pushHeld, and the cron tick sends it
// (lib/jobs/heldPushes.ts).

type NotificationData = Prisma.NotificationUncheckedCreateInput;

export interface QuietReader {
  timeZone: string | null;
  quietStartMinute: number | null;
  quietEndMinute: number | null;
}

// Whether it's the reader's quiet hours at `now`, in their own zone (the BOO-48 settings, 22:00 to 08:00
// unless they changed them). No database.
export const isQuietFor = (reader: QuietReader, now: Date) =>
  inQuietHours(localClock(now, zoneOf(reader.timeZone)).minute, quietHoursOf(reader.quietStartMinute, reader.quietEndMinute));

// The rows with pushHeld set on those whose push waits for quiet hours to end.
async function withHeldPushes(data: NotificationData[], now: Date): Promise<NotificationData[]> {
  const ids = Array.from(new Set(data.filter((d) => heldInQuietHours(d.type)).map((d) => d.userId)));
  if (ids.length === 0) return data;
  const readers = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, timeZone: true, quietStartMinute: true, quietEndMinute: true } });
  const quiet = new Set(readers.filter((r) => isQuietFor(r, now)).map((r) => r.id));
  return data.map((d) => (heldInQuietHours(d.type) && quiet.has(d.userId) ? { ...d, pushHeld: true } : d));
}

export async function createNotification(data: NotificationData) {
  const [row] = await withHeldPushes([data], new Date());
  const notification = await prisma.notification.create({ data: row });
  if (!row.pushHeld) await sendPushes([row]);
  return notification;
}

export async function createNotifications(data: NotificationData[]) {
  if (data.length === 0) return;
  const rows = await withHeldPushes(data, new Date());
  await prisma.notification.createMany({ data: rows });
  await sendPushes(rows.filter((r) => !r.pushHeld));
}
