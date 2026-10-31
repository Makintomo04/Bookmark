import prisma from "@/lib/db";
import { parseSchedule } from "@/lib/buddyReadsServer";
import { notSuspendedWhere } from "@/lib/privacy";
import { sendSystemPushes } from "@/lib/push";
import { circleProgress, progressPercent } from "@bookmark/shared/buddyReads";
import { progressSelect } from "@bookmark/shared/progress";
import { addDays, checkpointMinute, checkpointPush, CHECKPOINT_DAYS_AHEAD, inQuietHours, isDue, localClock, quietHoursOf } from "@bookmark/shared/reminders";
import { sendMail } from "@/lib/mailer";
import { appUrl } from "@/lib/siteUrl";
import { buildCheckpointEmail } from "@bookmark/shared/digest";
import { visibleComments } from "./circleCounts";
import { settingsUrl, unsubscribeLinks } from "./emailLinks";
import { claimSend } from "./ledger";
import { pageArgs, pages, zoneOf, type JobContext } from "./common";

// Circle checkpoints (the free part of BOO-11): two days before a section is due, in the morning, a member
// who hasn't reached its end yet hears which section, where they are, and how many comments wait there.
// Counted, never quoted, and only comments the circle page would show them (lib/jobs/circleCounts.ts).
// Muted circles stay quiet; finished members are past every section anyway. Sent at 9am, or when quiet
// hours end if they run past it.

// Members without the app (no phone registered) get the same reminder by email, to a confirmed address:
// it's how a web-only member hears before a section is due, not just on Sunday.
export async function runCheckpointReminders(ctx: JobContext): Promise<{ checkpoints: number; checkpointEmails: number }> {
  let sent = 0;
  let emailed = 0;
  const canEmail = !!process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  const candidates = (after: string | undefined) =>
    prisma.user.findMany({
      where: { AND: [{ checkpointReminders: true }, notSuspendedWhere(ctx.now)] },
      select: { id: true, email: true, emailVerified: true, timeZone: true, quietStartMinute: true, quietEndMinute: true, pushTokens: { select: { token: true } } },
      ...pageArgs(after),
    });

  for await (const users of pages(ctx, candidates)) {
    for (const user of users) {
      const byPush = user.pushTokens.length > 0;
      if (!byPush && !(canEmail && user.email && user.emailVerified)) continue;
      const clock = localClock(ctx.now, zoneOf(user.timeZone));
      const quiet = quietHoursOf(user.quietStartMinute, user.quietEndMinute);
      if (!isDue(checkpointMinute(quiet), clock.minute) || inQuietHours(clock.minute, quiet)) continue;
      const due = addDays(clock.day, CHECKPOINT_DAYS_AHEAD);

      const memberships = await prisma.buddyReadMember.findMany({
        where: { userId: user.id, buddyRead: { status: "ACTIVE" }, OR: [{ mutedAt: null }, { mutedAt: { isSet: false } }] },
        select: { bookId: true, notifiedProgress: true, buddyRead: { select: { id: true, title: true, schedule: true } } },
      });
      for (const m of memberships) {
        // A section with no end point can't be behind on. When several fall due the same day, one reminder
        // names the last of them: reaching it covers the rest.
        const checkpoint = parseSchedule(m.buddyRead.schedule)
          .filter((c) => c.due === due && c.until != null)
          .sort((a, b) => b.until! - a.until!)[0];
        if (!checkpoint) continue;
        const until = checkpoint.until!;
        const book = await prisma.book.findUnique({ where: { id: m.bookId }, select: { userId: true, ...progressSelect } });
        const progress = circleProgress(book && book.userId === user.id ? progressPercent(book) : 0, m.notifiedProgress);
        if (progress >= until) continue;
        if (!(await claimSend(user.id, "checkpoint", `${m.buddyRead.id}:${due}`, byPush ? "push" : "email"))) continue;

        // Replies included, like the circle page's locked "N comments ahead" row.
        const waiting = await visibleComments(user.id, m.buddyRead.id, { position: { gt: progress, lte: until } });
        if (byPush) {
          await sendSystemPushes([
            { tokens: user.pushTokens.map((t) => t.token), content: checkpointPush({ circleId: m.buddyRead.id, label: checkpoint.label, due, progress, until, waiting }) },
          ]);
          sent++;
          continue;
        }
        const links = unsubscribeLinks(user.id, "checkpoints");
        const email = buildCheckpointEmail({
          circleTitle: m.buddyRead.title, label: checkpoint.label, due, progress, until, waiting,
          circleUrl: `${appUrl}/circles/${m.buddyRead.id}`, settingsUrl: settingsUrl(), unsubscribeUrl: links.pageUrl,
        });
        try {
          await sendMail({ to: user.email!, ...email, headers: links.headers });
          emailed++;
        } catch (error) {
          console.error("[checkpoints] couldn't email", user.id, error);
        }
      }
    }
  }
  return { checkpoints: sent, checkpointEmails: emailed };
}
