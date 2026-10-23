import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { sendPushes } from "@/lib/push";

// Writing a notification for the bell, and pushing it to the recipient's phone when it's a kind that's
// pushed (packages/shared/src/push.ts). Use these rather than prisma.notification.create, so a new kind
// of notification can't forget the push.

type NotificationData = Prisma.NotificationUncheckedCreateInput;

export async function createNotification(data: NotificationData) {
  const notification = await prisma.notification.create({ data });
  await sendPushes([data]);
  return notification;
}

export async function createNotifications(data: NotificationData[]) {
  if (data.length === 0) return;
  await prisma.notification.createMany({ data });
  await sendPushes(data);
}
