import prisma from "@/lib/db";
import { readingStreakState } from "@/lib/achievements";
import { parseSchedule } from "@/lib/buddyReadsServer";
import { sendMail } from "@/lib/mailer";
import { canView, notSuspendedWhere, privacyOf, privacySelect, type Relation } from "@/lib/privacy";
import { mutualFollowIds } from "@/lib/recommendations";
import { appUrl } from "@/lib/siteUrl";
import { getGoalProgress } from "@/lib/stats";
import { circleProgress, progressPercent } from "@bookmark/shared/buddyReads";
import { buildWeeklyDigest, DIGEST_FRIENDS_MAX, goalPace, type DigestData, type DigestFriend } from "@bookmark/shared/digest";
import { progressSelect } from "@bookmark/shared/progress";
import { addDays, DIGEST_MINUTE, DIGEST_WEEKDAY, isoWeekKey, localClock } from "@bookmark/shared/reminders";
import { visibleComments, visibleFinishers } from "./circleCounts";
import { unsubscribeLinks } from "./emailLinks";
import { claimSend } from "./ledger";
import { pageArgs, pages, zoneOf, type JobContext } from "./common";

// The weekly email, "Your week in books": Sunday from 09:00 in the reader's zone, to verified addresses
// that opted in, on accounts that aren't suspended. Once per ISO week (the ledger). The words are built
// in packages/shared/src/digest.ts from counts and titles only: no comment, review or note text, ever.
// Quiet hours are for phones; an email waits in the inbox, so they don't apply.

// Emails a tick may send; the rest go on the next tick, inside the due window.
export const DIGEST_BUDGET = 300;
// When an empty Sunday stops being looked at again (local time).
const DIGEST_SETTLE_MINUTE = 20 * 60;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const notPrivate = { OR: [{ isPrivate: { isSet: false } }, { isPrivate: null }, { isPrivate: false }] };

// What friends did this week that they'd let a follower see: finishing or starting a book (the feed's
// rules, app/api/feed/route.ts), and books they sent this reader.
async function friendsWeek(userId: string, since: Date): Promise<DigestFriend[]> {
  const friendIds = await mutualFollowIds(userId);
  const friends = friendIds.length
    ? await prisma.user.findMany({ where: { id: { in: friendIds }, AND: [notSuspendedWhere()] }, select: { id: true, username: true, ...privacySelect } })
    : [];
  // Friends follow each other, so the reader sees what a follower may.
  const relation: Relation = { isSelf: false, isFollower: true, blocked: null };
  const visible = new Map(friends.filter((f) => f.username && canView(relation, privacyOf(f), "activity")).map((f) => [f.id, f.username!]));

  const [activity, sent] = await Promise.all([
    visible.size
      ? prisma.activity.findMany({
          where: { userId: { in: Array.from(visible.keys()) }, type: { in: ["COMPLETED_BOOK", "STARTED_BOOK"] }, createdAt: { gte: since }, book: notPrivate },
          orderBy: { createdAt: "desc" },
          take: DIGEST_FRIENDS_MAX * 2,
          select: { userId: true, type: true, book: { select: { title: true } } },
        })
      : [],
    prisma.notification.findMany({
      where: { userId, type: "BOOK_RECOMMENDED", createdAt: { gte: since }, actorId: { in: friendIds } },
      orderBy: { createdAt: "desc" },
      take: DIGEST_FRIENDS_MAX,
      select: { actorId: true, bookId: true, workId: true },
    }),
  ]);

  // A recommendation names the sender's copy or the catalogue work.
  const [sentBooks, sentWorks, senders] = await Promise.all([
    prisma.book.findMany({ where: { id: { in: sent.flatMap((n) => (n.bookId ? [n.bookId] : [])) } }, select: { id: true, title: true } }),
    prisma.work.findMany({ where: { id: { in: sent.flatMap((n) => (n.workId ? [n.workId] : [])) } }, select: { id: true, title: true } }),
    prisma.user.findMany({ where: { id: { in: sent.map((n) => n.actorId) } }, select: { id: true, username: true } }),
  ]);
  const titleOf = new Map([...sentBooks, ...sentWorks].map((b) => [b.id, b.title]));
  const senderName = new Map(senders.map((s) => [s.id, s.username]));

  // One line per friend and book: a book sent twice is said once, and finishing it beats starting it.
  const lines = new Map<string, DigestFriend>();
  const add = (line: DigestFriend) => {
    const key = `${line.username}|${line.kind === "sent" ? "sent" : "read"}|${line.bookTitle}`;
    if (!lines.has(key) || line.kind === "finished") lines.set(key, line);
  };
  for (const n of sent) {
    const title = (n.bookId && titleOf.get(n.bookId)) || (n.workId && titleOf.get(n.workId));
    const username = senderName.get(n.actorId);
    if (title && username) add({ username, kind: "sent", bookTitle: title });
  }
  for (const a of activity) {
    const username = visible.get(a.userId);
    if (username && a.book) add({ username, kind: a.type === "COMPLETED_BOOK" ? "finished" : "started", bookTitle: a.book.title });
  }
  return Array.from(lines.values()).slice(0, DIGEST_FRIENDS_MAX);
}

// Circle news: sections due in the next week, and per circle the new comments the reader's progress
// already reaches (never one past it, BOO-43's rule) and members who finished.
async function circlesWeek(userId: string, today: string, since: Date) {
  // A muted circle stays quiet here too, as in the bell and the checkpoint push.
  const memberships = await prisma.buddyReadMember.findMany({
    where: { userId, buddyRead: { status: "ACTIVE" }, OR: [{ mutedAt: null }, { mutedAt: { isSet: false } }] },
    select: { bookId: true, notifiedProgress: true, buddyRead: { select: { id: true, title: true, schedule: true } } },
  });
  const weekEnd = addDays(today, 6);
  const checkpoints: DigestData["checkpoints"] = [];
  const circles: DigestData["circles"] = [];
  for (const m of memberships) {
    const book = await prisma.book.findUnique({ where: { id: m.bookId }, select: { userId: true, ...progressSelect } });
    const progress = circleProgress(book && book.userId === userId ? progressPercent(book) : 0, m.notifiedProgress);
    for (const c of parseSchedule(m.buddyRead.schedule)) {
      // Only sections still ahead of them: one they've read past isn't "due".
      const ahead = c.until == null || progress < c.until;
      if (c.due && c.due >= today && c.due <= weekEnd && ahead) checkpoints.push({ circleTitle: m.buddyRead.title, label: c.label, due: c.due });
    }
    const [newComments, finished] = await Promise.all([
      visibleComments(userId, m.buddyRead.id, { createdAt: { gte: since }, position: { lte: progress } }),
      visibleFinishers(userId, m.buddyRead.id, since),
    ]);
    circles.push({ title: m.buddyRead.title, newComments, finished });
  }
  checkpoints.sort((a, b) => a.due.localeCompare(b.due));
  return { checkpoints, circles };
}

export async function digestFor(
  user: { id: string; username: string | null; displayName: string | null },
  zone: string,
  now: Date
): Promise<DigestData> {
  const today = localClock(now, zone).day;
  const since = new Date(now.getTime() - WEEK_MS);
  const year = Number(today.slice(0, 4));
  const [readingDays, finished, streak, goal, friends, circleNews, news] = await Promise.all([
    prisma.readingDay.count({ where: { userId: user.id, day: { gte: addDays(today, -6) } } }),
    prisma.activity.count({ where: { userId: user.id, type: "COMPLETED_BOOK", createdAt: { gte: since } } }),
    readingStreakState(user.id, zone, 1000, now),
    prisma.readingGoal.findFirst({ where: { userId: user.id, year, targetBooks: { gt: 0 } }, select: { targetBooks: true, createdAt: true } }),
    friendsWeek(user.id, since),
    circlesWeek(user.id, today, since),
    // The week's book news from the bell, newest first: series, new books announced, and books out.
    prisma.notification.findMany({
      where: { userId: user.id, type: { in: ["NEW_IN_SERIES", "NEW_BOOK", "PUBLICATION_DAY"] }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { type: true, workId: true, count: true },
      take: 30,
    }),
  ]);
  const workIds = Array.from(new Set(news.flatMap((n) => (n.workId ? [n.workId] : []))));
  const works = workIds.length
    ? await prisma.work.findMany({ where: { id: { in: workIds } }, select: { id: true, title: true, authors: true, seriesName: true, seriesPosition: true, releaseDate: true } })
    : [];
  const workById = new Map(works.map((w) => [w.id, w]));
  // Five of each, the work named once per kind.
  const newsOf = (type: string) => {
    const seen = new Set<string>();
    return news.flatMap((n) => {
      const work = n.type === type && n.workId ? workById.get(n.workId) : undefined;
      if (!work || seen.has(work.id)) return [];
      seen.add(work.id);
      return [{ work, count: n.count }];
    }).slice(0, 5);
  };
  return {
    name: user.displayName || user.username,
    readingDays,
    finished,
    streak: streak.streak,
    goal: goal ? { year, books: (await getGoalProgress(user.id, year)).books, target: goal.targetBooks, pace: goalPace(goal.targetBooks, today, localClock(goal.createdAt, zone).day) } : null,
    ...circleNews,
    friends,
    series: newsOf("NEW_IN_SERIES").map(({ work, count }) => ({ title: work.title, seriesName: work.seriesName, seriesPosition: work.seriesPosition, count })),
    newBooks: newsOf("NEW_BOOK").map(({ work, count }) => ({ title: work.title, author: work.authors[0] ?? null, releaseDate: work.releaseDate, count })),
    released: newsOf("PUBLICATION_DAY").map(({ work }) => ({ title: work.title, author: work.authors[0] ?? null })),
    today,
    logUrl: `${appUrl}/`,
    settingsUrl: `${appUrl}/settings#notifications`,
    unsubscribeUrl: unsubscribeLinks(user.id, "weekly").pageUrl,
  };
}


export async function runWeeklyDigest(ctx: JobContext): Promise<{ digests: number; emptyWeeks: number }> {
  const result = { digests: 0, emptyWeeks: 0 };
  // Without a secret there's no unsubscribe link, and the email can't go out without one.
  if (!process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()) return result;
  const candidates = (after: string | undefined) =>
    prisma.user.findMany({
      where: { AND: [{ weeklyEmail: true }, { email: { not: null } }, { emailVerified: { not: null } }, notSuspendedWhere(ctx.now)] },
      select: { id: true, email: true, username: true, displayName: true, timeZone: true },
      ...pageArgs(after),
    });

  for await (const users of pages(ctx, candidates)) {
    for (const user of users) {
      if (result.digests >= DIGEST_BUDGET) return result;
      const zone = zoneOf(user.timeZone);
      const clock = localClock(ctx.now, zone);
      // Any time on Sunday from 9am: the ledger keeps it to one a week, and the long window means a busy
      // Sunday that runs past a tick's budget still reaches everyone on a later tick.
      if (clock.weekday !== DIGEST_WEEKDAY || clock.minute < DIGEST_MINUTE) continue;
      const week = isoWeekKey(clock.day);
      // Already sent this week: skip before building, which is the costly part.
      if (await prisma.scheduledSend.findUnique({ where: { userId_kind_key: { userId: user.id, kind: "digest", key: week } }, select: { id: true } })) continue;
      const email = buildWeeklyDigest(await digestFor(user, zone, ctx.now));
      if (!email) {
        // From the evening on, an empty week is settled, so the rest of Sunday's ticks don't build it again.
        // Before that it's looked at again: some reading or a friend's finish later on Sunday still counts.
        if (clock.minute >= DIGEST_SETTLE_MINUTE) await claimSend(user.id, "digest", week, "none");
        result.emptyWeeks++;
        continue;
      }
      if (!(await claimSend(user.id, "digest", week, "email"))) continue;
      try {
        await sendMail({ to: user.email!, ...email, headers: unsubscribeLinks(user.id, "weekly").headers });
        result.digests++;
      } catch (error) {
        console.error("[digest] couldn't send", user.id, error);
      }
    }
  }
  return result;
}
