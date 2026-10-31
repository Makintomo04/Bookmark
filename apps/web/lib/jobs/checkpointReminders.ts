import prisma from "@/lib/db";
import { parseSchedule } from "@/lib/buddyReadsServer";
import { notSuspendedWhere } from "@/lib/privacy";
import { sendSystemPushes } from "@/lib/push";
import { circleProgress, progressPercent } from "@bookmark/shared/buddyReads";
import { progressSelect } from "@bookmark/shared/progress";
import { addDays, checkpointPush, CHECKPOINT_DAYS_AHEAD, CHECKPOINT_MINUTE, inQuietHours, isDue, localClock, quietHoursOf } from "@bookmark/shared/reminders";
import { claimSend } from "./ledger";
import { pageArgs, pages, zoneOf, type JobContext } from "./common";

// Circle checkpoints (the free part of BOO-11): two days before a section is due, in the morning, a member
// who hasn't reached its end yet hears which section, where they are, and how many comments wait there.
// Counted, never quoted. Muted circles stay quiet; finished members are past every section anyway.

// MongoDB: a soft-deleted comment has deletedAt set; most never had the field.
const liveComment = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

export async function runCheckpointReminders(ctx: JobContext): Promise<{ checkpoints: number }> {
  let sent = 0;
  const candidates = (after: string | undefined) =>
    prisma.user.findMany({
      where: { AND: [{ checkpointReminders: true }, { pushTokens: { some: {} } }, notSuspendedWhere(ctx.now)] },
      select: { id: true, timeZone: true, quietStartMinute: true, quietEndMinute: true, pushTokens: { select: { token: true } } },
      ...pageArgs(after),
    });

  for await (const users of pages(ctx, candidates)) {
    for (const user of users) {
      const clock = localClock(ctx.now, zoneOf(user.timeZone));
      if (!isDue(CHECKPOINT_MINUTE, clock.minute) || inQuietHours(clock.minute, quietHoursOf(user.quietStartMinute, user.quietEndMinute))) continue;
      const due = addDays(clock.day, CHECKPOINT_DAYS_AHEAD);

      const memberships = await prisma.buddyReadMember.findMany({
        where: { userId: user.id, buddyRead: { status: "ACTIVE" }, OR: [{ mutedAt: null }, { mutedAt: { isSet: false } }] },
        select: { bookId: true, notifiedProgress: true, buddyRead: { select: { id: true, schedule: true } } },
      });
      for (const m of memberships) {
        // A section with no end point can't be behind on.
        const checkpoint = parseSchedule(m.buddyRead.schedule).find((c) => c.due === due && c.until != null);
        if (!checkpoint) continue;
        const until = checkpoint.until!;
        const book = await prisma.book.findUnique({ where: { id: m.bookId }, select: { userId: true, ...progressSelect } });
        const progress = circleProgress(book && book.userId === user.id ? progressPercent(book) : 0, m.notifiedProgress);
        if (progress >= until) continue;
        if (!(await claimSend(user.id, "checkpoint", `${m.buddyRead.id}:${due}`, "push"))) continue;

        const waiting = await prisma.buddyReadComment.count({
          where: { buddyReadId: m.buddyRead.id, position: { gt: progress, lte: until }, userId: { not: user.id }, ...liveComment },
        });
        await sendSystemPushes([
          { tokens: user.pushTokens.map((t) => t.token), content: checkpointPush({ circleId: m.buddyRead.id, label: checkpoint.label, due, progress, until, waiting }) },
        ]);
        sent++;
      }
    }
  }
  return { checkpoints: sent };
}
