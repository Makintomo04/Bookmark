import prisma from "@/lib/db";
import { readingStreakState } from "@/lib/achievements";
import { parseSchedule } from "@/lib/buddyReadsServer";
import { sendMail } from "@/lib/mailer";
import { canView, notSuspendedWhere, privacyOf, privacySelect, type Relation } from "@/lib/privacy";
import { mutualFollowIds } from "@/lib/recommendations";
import { appUrl } from "@/lib/siteUrl";
import { getGoalProgress } from "@/lib/stats";
import { unsubscribeToken } from "@/lib/unsubscribeToken";
import { circleProgress, progressPercent } from "@bookmark/shared/buddyReads";
import { buildWeeklyDigest, DIGEST_FRIENDS_MAX, type DigestData, type DigestFriend } from "@bookmark/shared/digest";
import { progressSelect } from "@bookmark/shared/progress";
import { addDays, DIGEST_MINUTE, DIGEST_WEEKDAY, isDue, isoWeekKey, localClock } from "@bookmark/shared/reminders";
import { claimSend } from "./ledger";
import { pageArgs, pages, zoneOf, type JobContext } from "./common";

// The weekly email, "Your week in books": Sunday from 09:00 in the reader's zone, to verified addresses
// that opted in, on accounts that aren't suspended. Once per ISO week (the ledger). The words are built
// in packages/shared/src/digest.ts from counts and titles only: no comment, review or note text, ever.
// Quiet hours are for phones; an email waits in the inbox, so they don't apply.

// Emails a tick may send; the rest go on the next tick, inside the due window.
export const DIGEST_BUDGET = 300;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const liveComment = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
const notPrivate = { OR: [{ isPrivate: { isSet: false } }, { isPrivate: null }, { isPrivate: false }] };

// Books ahead of, or behind, where an even pace through the year would have them by `day`.
function paceBy(target: number, day: string): number {
  const year = Number(day.slice(0, 4));
  const start = Date.UTC(year, 0, 1);
  const through = (Date.parse(`${day}T12:00:00Z`) - start) / (Date.UTC(year + 1, 0, 1) - start);
  return Math.round(target * through);
}

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
  const memberships = await prisma.buddyReadMember.findMany({
    where: { userId, buddyRead: { status: "ACTIVE" } },
    select: { bookId: true, notifiedProgress: true, mutedAt: true, buddyRead: { select: { id: true, title: true, schedule: true } } },
  });
  const weekEnd = addDays(today, 6);
  const checkpoints: DigestData["checkpoints"] = [];
  const circles: DigestData["circles"] = [];
  for (const m of memberships) {
    for (const c of parseSchedule(m.buddyRead.schedule)) {
      if (c.due && c.due >= today && c.due <= weekEnd) checkpoints.push({ circleTitle: m.buddyRead.title, label: c.label, due: c.due });
    }
    const book = await prisma.book.findUnique({ where: { id: m.bookId }, select: { userId: true, ...progressSelect } });
    const progress = circleProgress(book && book.userId === userId ? progressPercent(book) : 0, m.notifiedProgress);
    const [newComments, finished] = await Promise.all([
      // A muted circle sends no comment news, here as in the bell.
      m.mutedAt
        ? 0
        : prisma.buddyReadComment.count({ where: { buddyReadId: m.buddyRead.id, userId: { not: userId }, createdAt: { gte: since }, position: { lte: progress }, ...liveComment } }),
      prisma.buddyReadMember.count({ where: { buddyReadId: m.buddyRead.id, userId: { not: userId }, finishedAt: { gte: since } } }),
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
  const [readingDays, finished, streak, goal, friends, circleNews, series] = await Promise.all([
    prisma.readingDay.count({ where: { userId: user.id, day: { gte: addDays(today, -6) } } }),
    prisma.activity.count({ where: { userId: user.id, type: "COMPLETED_BOOK", createdAt: { gte: since } } }),
    readingStreakState(user.id, zone, 1000, now),
    prisma.readingGoal.findFirst({ where: { userId: user.id, year, targetBooks: { gt: 0 } }, select: { targetBooks: true } }),
    friendsWeek(user.id, since),
    circlesWeek(user.id, today, since),
    prisma.notification.findMany({ where: { userId: user.id, type: "NEW_IN_SERIES", createdAt: { gte: since } }, select: { workId: true }, take: 5 }),
  ]);
  const works = series.length
    ? await prisma.work.findMany({ where: { id: { in: series.flatMap((n) => (n.workId ? [n.workId] : [])) } }, select: { title: true, seriesName: true } })
    : [];
  const token = unsubscribeToken(user.id);
  return {
    name: user.displayName || user.username,
    readingDays,
    finished,
    streak: streak.streak,
    goal: goal ? { year, books: (await getGoalProgress(user.id, year)).books, target: goal.targetBooks, pace: paceBy(goal.targetBooks, today) } : null,
    ...circleNews,
    friends,
    series: works.map((w) => ({ title: w.title, seriesName: w.seriesName })),
    logUrl: `${appUrl}/`,
    settingsUrl: `${appUrl}/settings#notifications`,
    unsubscribeUrl: `${appUrl}/email/unsubscribe?t=${encodeURIComponent(token)}`,
  };
}

// The List-Unsubscribe pair Gmail and Yahoo require of bulk mail: one click from the inbox, a POST (RFC 8058).
export function unsubscribeHeaders(userId: string): Record<string, string> {
  const url = `${appUrl}/api/email/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId))}`;
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
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
      if (clock.weekday !== DIGEST_WEEKDAY || !isDue(DIGEST_MINUTE, clock.minute)) continue;
      const week = isoWeekKey(clock.day);
      // Already sent this week: skip before building, which is the costly part.
      if (await prisma.scheduledSend.findUnique({ where: { userId_kind_key: { userId: user.id, kind: "digest", key: week } }, select: { id: true } })) continue;
      // Built before claiming, so an empty week stays unclaimed; it is looked at again next tick, inside the window.
      const email = buildWeeklyDigest(await digestFor(user, zone, ctx.now));
      if (!email) {
        result.emptyWeeks++;
        continue;
      }
      if (!(await claimSend(user.id, "digest", week, "email"))) continue;
      try {
        await sendMail({ to: user.email!, ...email, headers: unsubscribeHeaders(user.id) });
        result.digests++;
      } catch (error) {
        console.error("[digest] couldn't send", user.id, error);
      }
    }
  }
  return result;
}
