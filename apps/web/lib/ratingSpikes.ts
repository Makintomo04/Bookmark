import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { countedRatingWhere, sharedBookWhere } from "@/lib/privacy";
import { logStaffAction } from "@/lib/staffLog";
import { staffFail, type StaffOutcome } from "@/lib/staffRoute";
import { isObjectId } from "@/lib/staffUsers";
import { roleOf } from "@/lib/roles";
import { bookHref } from "@/lib/workKey";
import { findSpike, NEW_ACCOUNT_DAYS, SPIKE_WINDOW_DAYS, type RatingRow, type SpikeAction, type SpikeSide } from "@/lib/ratingSpikeRules";

export * from "@/lib/ratingSpikeRules";

// Rating-spike checks on /staff/ratings (rules in lib/ratingSpikeRules.ts). Nothing is written when a
// reader rates: the queue looks for bursts when staff open it, from the ratings themselves, so every way of
// rating is covered. Books don't record when they were rated, so the day the copy went on the reader's shelf
// stands in for it (nearly always the same day for a new account), and only a young account's ratings can
// flag a book, so a long-standing reader's old shelf never does.
//
// "Hold" takes the flagged ratings out of the average and every "people you follow" signal the way a hidden
// rating is (Book.ratingHiddenAt), leaving the readers' reviews and own copies alone. "Release" lifts that.

const DAY = 24 * 60 * 60 * 1000;
const SCAN_MAX = 5000;

export interface SpikeEntry {
  workId: string;
  title: string;
  path: string | null;
  side: SpikeSide;
  count: number;
  windowTotal: number;
  firstAt: string;
  lastAt: string;
  // The book's current average, and the average without the flagged ratings, to see what they move.
  average: number | null;
  averageWithout: number | null;
}

export interface HeldEntry {
  workId: string;
  title: string;
  path: string | null;
  held: number;
  heldAt: string;
  heldBy: string | null;
  note: string | null;
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

const ratedWhere = (since: Date): Prisma.BookWhereInput => ({
  workId: { not: null }, rating: { gt: 0 }, createdAt: { gte: since }, AND: [sharedBookWhere, countedRatingWhere],
});

// Each book's ratings in the window, with each reader's account age, as findSpike wants them.
async function windowRows(workIds: string[], since: Date): Promise<Map<string, RatingRow[]>> {
  const books = await prisma.book.findMany({
    where: { workId: { in: workIds }, ...ratedWhere(since) },
    select: { id: true, workId: true, userId: true, rating: true, createdAt: true, user: { select: { createdAt: true } } },
    take: SCAN_MAX,
  });
  const byWork = new Map<string, RatingRow[]>();
  for (const b of books) {
    byWork.set(b.workId!, [...(byWork.get(b.workId!) ?? []), {
      bookId: b.id, userId: b.userId, rating: b.rating!, ratedAt: b.createdAt, accountCreatedAt: b.user.createdAt,
    }]);
  }
  return byWork;
}

export async function spikeQueue(now = new Date()): Promise<SpikeEntry[]> {
  const since = new Date(now.getTime() - SPIKE_WINDOW_DAYS * DAY);
  // Books that got a rating from a young account in the window; findSpike then judges each.
  const young = await prisma.book.findMany({
    where: { ...ratedWhere(since), user: { createdAt: { gte: new Date(since.getTime() - NEW_ACCOUNT_DAYS * DAY) } } },
    select: { workId: true },
    take: SCAN_MAX,
  });
  const workIds = Array.from(new Set(young.map((b) => b.workId!)));
  if (!workIds.length) return [];
  const [rows, works] = await Promise.all([
    windowRows(workIds, since),
    prisma.work.findMany({ where: { id: { in: workIds } }, select: { id: true, title: true, authors: true, openLibraryKey: true, ratingsReviewedAt: true } }),
  ]);

  const entries: SpikeEntry[] = [];
  for (const work of works) {
    const spike = findSpike(rows.get(work.id) ?? [], now, work.ratingsReviewedAt);
    if (!spike) continue;
    const all = await prisma.book.findMany({
      where: { workId: work.id, rating: { gt: 0 }, AND: [sharedBookWhere, countedRatingWhere] },
      select: { id: true, rating: true }, take: SCAN_MAX,
    });
    const flagged = new Set(spike.bookIds);
    entries.push({
      workId: work.id,
      title: `${work.title}${work.authors[0] ? ` by ${work.authors[0]}` : ""}`,
      path: bookHref({ workKey: work.openLibraryKey, pageWorkId: work.id, title: work.title }),
      side: spike.side, count: spike.count, windowTotal: spike.windowTotal,
      firstAt: spike.firstAt.toISOString(), lastAt: spike.lastAt.toISOString(),
      average: mean(all.map((b) => b.rating!)),
      averageWithout: mean(all.filter((b) => !flagged.has(b.id)).map((b) => b.rating!)),
    });
  }
  // The biggest bursts first.
  return entries.sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

const heldIds = (after: unknown): string[] =>
  after && typeof after === "object" && Array.isArray((after as { bookIds?: unknown }).bookIds)
    ? (after as { bookIds: unknown[] }).bookIds.filter((id): id is string => typeof id === "string")
    : [];

// Books whose latest hold hasn't been released, from the staff log (the held ratings' ids are kept in it).
export async function heldQueue(): Promise<HeldEntry[]> {
  const logs = await prisma.staffAction.findMany({
    where: { action: { in: ["ratings.hold", "ratings.release"] }, targetType: "work" },
    orderBy: { createdAt: "desc" }, take: 500,
    select: { action: true, targetId: true, createdAt: true, actorId: true, reason: true, after: true },
  });
  const latest = new Map<string, (typeof logs)[number]>();
  for (const log of logs) if (!latest.has(log.targetId)) latest.set(log.targetId, log);
  const holds = Array.from(latest.values()).filter((l) => l.action === "ratings.hold");
  if (!holds.length) return [];
  const [works, people] = await Promise.all([
    prisma.work.findMany({ where: { id: { in: holds.map((h) => h.targetId) } }, select: { id: true, title: true, authors: true, openLibraryKey: true } }),
    prisma.user.findMany({ where: { id: { in: holds.map((h) => h.actorId) } }, select: { id: true, username: true } }),
  ]);
  const workOf = new Map(works.map((w) => [w.id, w]));
  const nameOf = new Map(people.map((u) => [u.id, u.username]));
  return holds.flatMap((h) => {
    const work = workOf.get(h.targetId);
    return work ? [{
      workId: work.id, title: `${work.title}${work.authors[0] ? ` by ${work.authors[0]}` : ""}`,
      path: bookHref({ workKey: work.openLibraryKey, pageWorkId: work.id, title: work.title }),
      held: heldIds(h.after).length, heldAt: h.createdAt.toISOString(), heldBy: nameOf.get(h.actorId) ?? null, note: h.reason,
    }] : [];
  });
}

type Actor = { id: string; role?: string | null; isStaff?: boolean | null };

export async function actOnSpike(actor: Actor, workId: string, action: SpikeAction, note?: string): Promise<StaffOutcome<{ affected: number }>> {
  if (!isObjectId(workId)) return staffFail(404, "No book with that id.");
  const work = await prisma.work.findUnique({ where: { id: workId }, select: { id: true, ratingsReviewedAt: true } });
  if (!work) return staffFail(404, "No book with that id.");
  const reason = note?.trim().slice(0, 500) || null;
  const now = new Date();
  let affected = 0;
  let bookIds: string[] = [];

  if (action === "release") {
    const last = await prisma.staffAction.findFirst({
      where: { action: { in: ["ratings.hold", "ratings.release"] }, targetType: "work", targetId: workId }, orderBy: { createdAt: "desc" },
      select: { action: true, after: true },
    });
    if (last?.action !== "ratings.hold") return staffFail(400, "Nothing is being held on that book.");
    bookIds = heldIds(last.after);
    affected = (await prisma.book.updateMany({ where: { id: { in: bookIds }, workId }, data: { ratingHiddenAt: null } })).count;
  } else {
    // Recomputed here rather than trusted from the page, so a stale card can't hold the wrong ratings.
    if (action === "hold") {
      const since = new Date(now.getTime() - SPIKE_WINDOW_DAYS * DAY);
      const spike = findSpike((await windowRows([workId], since)).get(workId) ?? [], now, work.ratingsReviewedAt);
      if (!spike) return staffFail(409, "That burst isn't there any more. Refresh the list.");
      bookIds = spike.bookIds;
      affected = (await prisma.book.updateMany({ where: { id: { in: bookIds } }, data: { ratingHiddenAt: now } })).count;
    }
    await prisma.work.update({ where: { id: workId }, data: { ratingsReviewedAt: now } });
  }

  await logStaffAction({
    actorId: actor.id, action: `ratings.${action}`, targetType: "work", targetId: workId,
    after: { bookIds, affected, byRole: roleOf(actor) }, reason,
  });
  return { ok: true, value: { affected } };
}
