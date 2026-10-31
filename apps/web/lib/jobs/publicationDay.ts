import prisma from "@/lib/db";
import { authorSlug } from "@/lib/authorNames";
import { MERGED_PREFIX } from "@/lib/catalogueMergeRules";
import { createNotifications } from "@/lib/notifications";
import { notSuspendedWhere } from "@/lib/privacy";
import { seriesKey } from "@/lib/series";
import { addDays, checkpointMinute, inQuietHours, localClock, quietHoursOf } from "@bookmark/shared/reminders";
import { isFirstRelease, publicationDayReaders } from "@/lib/releaseRules";
import { claimSend } from "./ledger";
import { outOfTime, zoneOf, type JobContext } from "./common";

// Publication day (BOO-8): on the morning a book comes out, in the reader's own zone, a bell notification
// and a push for everyone who has it on Want to read, or follows its author or its series. Sent from 9am, or
// when quiet hours end; any later tick that day will do, since the ledger keeps it to one per reader per
// book. Title and author only.
//
// A book's release date is Work.releaseDate. Somewhere in the world it's that day from a day before UTC's
// to a day after, so each tick looks at those three days' books and keeps the readers for whom it's today.

// Alerts a tick may send; the rest go on the next tick, the same day.
export const PUBLICATION_DAY_BUDGET = 2000;
// A reader told the book was announced this recently (NEW_BOOK, often on the day itself) isn't told again.
const ANNOUNCED_WITHIN_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

async function readersOf(work: { id: string; authors: string[]; authorKeys: string[]; seriesName: string | null }, now: Date) {
  const slugs = work.authors.map(authorSlug).filter(Boolean);
  const [shelf, authorFollows, seriesFollows, told] = await Promise.all([
    prisma.book.findMany({ where: { workId: work.id }, select: { userId: true, status: true } }),
    prisma.authorFollow.findMany({ where: { OR: [{ slug: { in: slugs } }, ...(work.authorKeys.length ? [{ authorKey: { in: work.authorKeys } }] : [])] }, select: { userId: true } }),
    work.seriesName && work.authors[0] ? prisma.seriesFollow.findMany({ where: { seriesKey: seriesKey(work.seriesName, work.authors[0]) }, select: { userId: true } }) : [],
    prisma.notification.findMany({ where: { type: "NEW_BOOK", workId: work.id, createdAt: { gte: new Date(now.getTime() - ANNOUNCED_WITHIN_DAYS * DAY_MS) } }, select: { userId: true } }),
  ]);
  return publicationDayReaders({
    shelf,
    followers: [...authorFollows, ...seriesFollows].map((f) => f.userId),
    recentlyTold: new Set(told.map((n) => n.userId)),
  });
}

export async function runPublicationDay(ctx: JobContext): Promise<{ publicationDays: number }> {
  let sent = 0;
  const utcToday = ctx.now.toISOString().slice(0, 10);
  const works = await prisma.work.findMany({
    where: { releaseDate: { in: [addDays(utcToday, -1), utcToday, addDays(utcToday, 1)] }, NOT: { key: { startsWith: MERGED_PREFIX } } },
    select: { id: true, authors: true, authorKeys: true, seriesName: true, releaseDate: true, firstPublishYear: true },
    take: 1000,
  });

  for (const work of works) {
    if (!work.releaseDate || !isFirstRelease({ releaseDate: work.releaseDate, firstPublishYear: work.firstPublishYear })) continue;
    if (outOfTime(ctx) || sent >= PUBLICATION_DAY_BUDGET) break;
    const readerIds = await readersOf(work, ctx.now);
    if (readerIds.length === 0) continue;
    // Who's already been told is settled by the ledger, so only the time of day is checked here.
    const users = await prisma.user.findMany({
      where: { id: { in: readerIds }, AND: [notSuspendedWhere(ctx.now)] },
      select: { id: true, timeZone: true, quietStartMinute: true, quietEndMinute: true },
    });
    const rows = [];
    for (const user of users) {
      if (sent + rows.length >= PUBLICATION_DAY_BUDGET) break;
      const clock = localClock(ctx.now, zoneOf(user.timeZone));
      const quiet = quietHoursOf(user.quietStartMinute, user.quietEndMinute);
      if (clock.day !== work.releaseDate || clock.minute < checkpointMinute(quiet) || inQuietHours(clock.minute, quiet)) continue;
      if (!(await claimSend(user.id, "release", work.id, "push"))) continue;
      rows.push({ userId: user.id, actorId: user.id, type: "PUBLICATION_DAY" as const, workId: work.id });
    }
    await createNotifications(rows);
    sent += rows.length;
  }
  return { publicationDays: sent };
}
