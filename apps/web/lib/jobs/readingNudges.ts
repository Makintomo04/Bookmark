import prisma from "@/lib/db";
import { readingStreakState } from "@/lib/achievements";
import { notSuspendedWhere } from "@/lib/privacy";
import { sendSystemPushes } from "@/lib/push";
import { progressPercent, progressSelect } from "@bookmark/shared/progress";
import {
  isDue,
  localClock,
  nudgeFor,
  quietHoursOf,
  readingReminderPush,
  streakAlertMinute,
  streakAlertPush,
  STREAK_ALERT_MIN_DAYS,
  type ReminderBook,
} from "@bookmark/shared/reminders";
import { claimSend } from "./ledger";
import { pageArgs, pages, zoneOf, type JobContext } from "./common";

// The daily reading reminder and the evening streak alert, each at most once per local day (ledger kinds
// "nudge" and "streak"). A morning reminder and a 7pm streak alert can both arrive on a day the streak is at
// risk; an evening reminder is replaced by the alert. Push only, to readers with the app on a phone.

// Enough days back to name any streak a reader has: the alert says how long it is.
const STREAK_CAP = 1000;

export interface NudgeResult {
  reminders: number;
  streakAlerts: number;
}

// The book they last logged progress on, for the reminder's words. A private copy
// stays off the lock screen, like everything else read over shoulders.
async function reminderBook(userId: string): Promise<ReminderBook | null> {
  const book = await prisma.book.findFirst({
    where: { userId, status: "STARTED", OR: [{ isPrivate: { isSet: false } }, { isPrivate: null }, { isPrivate: false }] },
    orderBy: [{ progressAt: "desc" }, { startedAt: "desc" }],
    select: { id: true, title: true, ...progressSelect, currentPercent: true, logsPercent: true, logsIn: true },
  });
  if (!book) return null;
  // Said the way they log it: a Kindle, chapter or location reader thinks in percent, not a page they never typed.
  if (book.logsPercent || (book.logsIn && book.logsIn !== "PAGES")) {
    return { id: book.id, title: book.title, at: Math.floor(progressPercent(book)), of: 100, unit: "PERCENT" };
  }
  const minutes = book.progressUnit === "MINUTES";
  return {
    id: book.id,
    title: book.title,
    at: minutes ? book.currentMinute ?? null : book.currentPage ?? null,
    of: minutes ? book.audioMinutes ?? null : book.pages || null,
    unit: minutes ? "MINUTES" : "PAGES",
  };
}

export async function runReadingNudges(ctx: JobContext): Promise<NudgeResult> {
  const result: NudgeResult = { reminders: 0, streakAlerts: 0 };
  const candidates = (after: string | undefined) =>
    prisma.user.findMany({
      where: {
        AND: [{ OR: [{ readingReminderMinute: { not: null } }, { streakAlerts: true }] }, { pushTokens: { some: {} } }, notSuspendedWhere(ctx.now)],
      },
      select: {
        id: true,
        timeZone: true,
        readingReminderMinute: true,
        streakAlerts: true,
        quietStartMinute: true,
        quietEndMinute: true,
        pushTokens: { select: { token: true } },
      },
      ...pageArgs(after),
    });

  for await (const users of pages(ctx, candidates)) {
    for (const user of users) {
      const zone = zoneOf(user.timeZone);
      const clock = localClock(ctx.now, zone);
      const quiet = quietHoursOf(user.quietStartMinute, user.quietEndMinute);
      // Nothing can be due outside the reminder's and the streak alert's windows: skip the streak query.
      const reminderDue = user.readingReminderMinute !== null && isDue(user.readingReminderMinute, clock.minute);
      const streakDue = !!user.streakAlerts && isDue(streakAlertMinute(quiet), clock.minute);
      if (!reminderDue && !streakDue) continue;

      const { streak, readToday } = await readingStreakState(user.id, zone, STREAK_CAP, ctx.now);
      const nudge = nudgeFor({
        minute: clock.minute,
        quiet,
        reminderMinute: user.readingReminderMinute,
        streakAlerts: !!user.streakAlerts,
        streak,
        readToday,
      });
      if (!nudge) continue;
      if (!(await claimSend(user.id, nudge === "streak" ? "streak" : "nudge", clock.day, "push"))) continue;

      const content = nudge === "streak" && streak >= STREAK_ALERT_MIN_DAYS ? streakAlertPush(streak) : readingReminderPush(await reminderBook(user.id));
      await sendSystemPushes([{ tokens: user.pushTokens.map((t) => t.token), content }]);
      if (nudge === "streak") result.streakAlerts++;
      else result.reminders++;
    }
  }
  return result;
}
