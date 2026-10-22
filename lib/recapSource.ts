import type { Recap } from "@prisma/client";
import prisma from "@/lib/db";
import { isBlockedEitherWay } from "@/lib/buddyReadsServer";
import type { CommentAuthor } from "@/lib/buddyReads";
import { workPopularity } from "@/lib/openLibrary";
import { progressPercent, progressSelect } from "@/lib/progress";
import type { CircleThread, FinishedInSeries, Popularity, RecapSource, RecapWork, StoredRecap } from "@/lib/recap";

// The database side of Catch me up (lib/recap.ts): the reader's book and its work, the finished earlier
// books of its series, popularity for the gate, notes, circle discussion rows, and the kept recaps.

// Open Library counts are kept on the Work and looked up again after this long.
const POPULARITY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Shelf statuses that count as a Bookmark reader of a work.
const READER_STATUSES = ["STARTED", "PAUSED", "COMPLETED", "DNF"] as const;
const COMMENT_ROWS_MAX = 2000;
const NOTES_MAX = 50;

const workSelect = {
  id: true, title: true, authors: true, seriesName: true, seriesPosition: true, openLibraryKey: true,
  olEditionCount: true, olRatingsCount: true, olReadingLogCount: true, popularityCheckedAt: true,
} as const;

type WorkRow = {
  id: string; title: string; authors: string[]; seriesName: string | null; seriesPosition: number | null; openLibraryKey: string | null;
  olEditionCount: number | null; olRatingsCount: number | null; olReadingLogCount: number | null; popularityCheckedAt: Date | null;
};

// Popularity for these works: Bookmark readers counted now, Open Library counts from the Work, looked up
// (in one request) for works never checked or checked over a month ago. A failed lookup leaves the old
// counts, or none: the gate then goes by Bookmark readers alone.
async function withPopularity(works: WorkRow[], now = new Date()): Promise<RecapWork[]> {
  const stale = works.filter((w) => w.openLibraryKey && (!w.popularityCheckedAt || now.getTime() - w.popularityCheckedAt.getTime() > POPULARITY_TTL_MS));
  const fresh = new Map<string, { editions: number; ratings: number; readingLog: number } | null>();
  if (stale.length > 0) {
    try {
      const found = await workPopularity(stale.map((w) => w.openLibraryKey!));
      for (const w of stale) {
        const counts = found.get(w.openLibraryKey!) ?? null;
        fresh.set(w.id, counts);
        await prisma.work.update({
          where: { id: w.id },
          data: { olEditionCount: counts?.editions ?? 0, olRatingsCount: counts?.ratings ?? 0, olReadingLogCount: counts?.readingLog ?? 0, popularityCheckedAt: now },
        });
      }
    } catch (err) {
      console.warn("recaps: popularity lookup failed", err instanceof Error ? err.message : err);
    }
  }
  return Promise.all(works.map(async (w) => {
    const counts = fresh.has(w.id) ? fresh.get(w.id) : undefined;
    const bookmarkReaders = await prisma.book.count({ where: { workId: w.id, status: { in: [...READER_STATUSES] } } });
    const popularity: Popularity = {
      bookmarkReaders,
      olEditions: counts !== undefined ? counts?.editions ?? 0 : w.olEditionCount,
      olRatings: counts !== undefined ? counts?.ratings ?? 0 : w.olRatingsCount,
      olReadingLog: counts !== undefined ? counts?.readingLog ?? 0 : w.olReadingLogCount,
    };
    return { id: w.id, title: w.title, authors: w.authors, seriesName: w.seriesName, seriesPosition: w.seriesPosition, popularity };
  }));
}

const toStored = (r: Recap): StoredRecap => ({
  id: r.id,
  kind: r.kind,
  bucket: r.bucket,
  confident: r.confident,
  paragraphs: r.paragraphs,
  reachedPercent: r.reachedPercent,
  coveredWorkIds: r.coveredWorkIds,
  vote: r.vote,
  createdAt: r.createdAt,
});

export const prismaRecapSource: RecapSource = {
  async context(userId, bookId) {
    const book = await prisma.book.findFirst({
      where: { id: bookId, userId },
      select: { ...progressSelect, id: true, title: true, author: true, workId: true, workKey: true, startedAt: true, progressAt: true },
    });
    if (!book) return null;
    const workRow = book.workId
      ? await prisma.work.findUnique({ where: { id: book.workId }, select: workSelect })
      : book.workKey ? await prisma.work.findFirst({ where: { openLibraryKey: book.workKey }, select: workSelect }) : null;
    if (!workRow) return { book, work: null, finishedInSeries: [] };

    // Finished books of the same series on the reader's shelf. lib/recap.ts decides which count.
    let seriesRows: { book: Parameters<typeof progressPercent>[0] & { id: string }; work: WorkRow }[] = [];
    if (workRow.seriesName && (workRow.seriesPosition ?? 0) > 1) {
      const seriesWorks = await prisma.work.findMany({
        where: { id: { not: workRow.id }, seriesName: { equals: workRow.seriesName, mode: "insensitive" }, seriesPosition: { lt: workRow.seriesPosition! } },
        select: workSelect,
        take: 50,
      });
      if (seriesWorks.length > 0) {
        const books = await prisma.book.findMany({
          where: { userId, workId: { in: seriesWorks.map((w) => w.id) }, OR: [{ status: "COMPLETED" }, { timesRead: { gt: 0 } }] },
          select: { ...progressSelect, id: true, workId: true },
        });
        const workById = new Map(seriesWorks.map((w) => [w.id, w]));
        seriesRows = books.flatMap((b) => (b.workId && workById.has(b.workId) ? [{ book: b, work: workById.get(b.workId)! }] : []));
      }
    }

    const works = await withPopularity([workRow, ...seriesRows.map((r) => r.work)]);
    const byId = new Map(works.map((w) => [w.id, w]));
    const finishedInSeries: FinishedInSeries[] = seriesRows.map((r) => ({ bookId: r.book.id, percent: progressPercent(r.book), work: byId.get(r.work.id)! }));
    return { book, work: byId.get(workRow.id)!, finishedInSeries };
  },

  async notes(bookIds) {
    if (bookIds.length === 0) return [];
    const rows = await prisma.note.findMany({
      where: { bookId: { in: bookIds } },
      orderBy: { createdAt: "asc" },
      take: NOTES_MAX,
      select: { bookId: true, title: true, content: true },
    });
    return rows;
  },

  // The reader's circles for these books: every comment row, with the members who may be shown (not
  // removed, not blocked either way). lib/recap.ts runs the spoiler lock over them.
  async circles(userId, bookIds) {
    if (bookIds.length === 0) return [];
    const memberships = await prisma.buddyReadMember.findMany({ where: { userId, bookId: { in: bookIds } }, select: { buddyReadId: true, bookId: true } });
    const threads: CircleThread[] = [];
    for (const m of memberships) {
      const memberRows = await prisma.buddyReadMember.findMany({ where: { buddyReadId: m.buddyReadId }, select: { userId: true } });
      const users = await prisma.user.findMany({ where: { id: { in: memberRows.map((r) => r.userId) } }, select: { id: true, username: true, image: true, favColour: true } });
      const authors = new Map<string, CommentAuthor>();
      for (const u of users) {
        if (u.id !== userId && (await isBlockedEitherWay(userId, u.id))) continue;
        authors.set(u.id, { username: u.username, image: u.image, favColour: u.favColour });
      }
      const rows = await prisma.buddyReadComment.findMany({
        where: { buddyReadId: m.buddyReadId },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        take: COMMENT_ROWS_MAX,
        include: { reactions: { select: { userId: true, emoji: true } } },
      });
      threads.push({ bookId: m.bookId, rows, authors });
    }
    return threads;
  },

  async cached(key) {
    const row = await prisma.recap.findUnique({ where: { userId_workId_kind_bucket: key } });
    return row ? toStored(row) : null;
  },

  async save(recap) {
    const { userId, workId, kind, bucket, ...rest } = recap;
    // Two requests racing for one key: the second finds the first row and leaves it as it is.
    const where = { userId_workId_kind_bucket: { userId, workId, kind, bucket } };
    try {
      return toStored(await prisma.recap.upsert({ where, create: { userId, workId, kind, bucket, ...rest }, update: {} }));
    } catch (err) {
      if ((err as { code?: string })?.code !== "P2002") throw err;
      return toStored((await prisma.recap.findUnique({ where }))!);
    }
  },
};

// The reader's thumbs up or down on one of their recaps. Null clears it. False when it isn't theirs.
export async function voteOnRecap(userId: string, recapId: string, vote: "UP" | "DOWN" | null): Promise<boolean> {
  const { count } = await prisma.recap.updateMany({ where: { id: recapId, userId }, data: { vote, votedAt: vote ? new Date() : null } });
  return count === 1;
}
