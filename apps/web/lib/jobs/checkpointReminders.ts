import prisma from "@/lib/db";
import { parseSchedule } from "@/lib/buddyReadsServer";
import { notSuspendedWhere } from "@/lib/privacy";
import { sendSystemPushes } from "@/lib/push";
import { circleProgress, progressPercent } from "@bookmark/shared/buddyReads";
import { progressSelect } from "@bookmark/shared/progress";
import { addDays, checkpointMinute, checkpointPush, CHECKPOINT_DAYS_AHEAD, inQuietHours, isDue, localClock, quietHoursOf } from "@bookmark/shared/reminders";
import { visibleComments } from "./circleCounts";
import { claimSend } from "./ledger";
import { pageArgs, pages, zoneOf, type JobContext } from "./common";

// Circle checkpoints (the free part of BOO-11): two days before a section is due, in the morning, a member
// who hasn't reached its end yet hears which section, where they are, and how many comments wait there.
// Counted, never quoted, and only comments the circle page would show them (lib/jobs/circleCounts.ts).
// Muted circles stay quiet; finished members are past every section anyway. Sent at 9am, or when quiet
// hours end if they run past it.

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
      const quiet = quietHoursOf(user.quietStartMinute, user.quietEndMinute);
      if (!isDue(checkpointMinute(quiet), clock.minute) || inQuietHours(clock.minute, quiet)) continue;
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

        const waiting = await visibleComments(user.id, m.buddyRead.id, { position: { gt: progress, lte: until } });
        await sendSystemPushes([
          { tokens: user.pushTokens.map((t) => t.token), content: checkpointPush({ circleId: m.buddyRead.id, label: checkpoint.label, due, progress, until, waiting }) },
        ]);
        sent++;
      }
    }
  }
  return { checkpoints: sent };
}
