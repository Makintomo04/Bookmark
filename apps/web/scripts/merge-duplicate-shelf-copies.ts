// Merges the second (and third…) copies of a book on one reader's shelf into one. Before POST /api/books
// turned away a book the reader already had (lib/shelfCopy.ts), a double-click on Want to read or the
// add-book modal could shelve the same book two or three times.
//
//   node scripts/with-test-db.mjs node scripts/merge-duplicate-shelf-copies.ts --dry-run   # the test database
//   node --env-file=.env.local scripts/merge-duplicate-shelf-copies.ts --dry-run          # whatever DATABASE_URL is
//   node --env-file=.env.local scripts/merge-duplicate-shelf-copies.ts                    # merge
//
// Copies are the same book by the rule lib/shelfCopy.ts uses: same catalogue Work, same Open Library work
// key, or (for a book without a key) the same title and author. A group holding two different work keys
// that no catalogue Work ties together is reported and left alone.
//
// Which copy stays, in order: one a reading circle uses (its progress drives the circle), the furthest
// along shelf (Reading > Finished > Did not finish > Want to read > Will not read), the most progress,
// the most recently touched, then the oldest. Onto it go the others' notes, recaps, notifications,
// circle memberships and favourite; their finished and DNF reads unless the same read is already there
// (open reads are dropped: the kept copy is the one being read); feed activity of a kind it doesn't
// already have; and a review, rating, tags, genre and the like where it has none. Then they're deleted.
// A copy marked private makes the kept copy private, so nothing hidden becomes public.
//
// Readers with an import still running are skipped: it re-inserts any of its books that has gone.
// Safe to re-run: a shelf with no duplicates is left as it is.
import { PrismaClient, type Book, type Status } from "@prisma/client";
import { sameBook } from "@bookmark/shared/workKey";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

const SHELF_RANK: Record<Status, number> = { STARTED: 4, PAUSED: 4, COMPLETED: 3, DNF: 2, NOT_STARTED: 1, NOT_INTERESTED: 0 };
const OPEN: Status[] = ["STARTED", "PAUSED"];

type Copy = Pick<Book,
  "id" | "userId" | "title" | "author" | "workKey" | "workId" | "editionId" | "status" | "currentPage" | "currentMinute" |
  "progressAt" | "completedAt" | "startedAt" | "review" | "reviewSpoiler" | "reviewPrivate" | "reviewHiddenAt" | "rating" |
  "ratingHiddenAt" | "tags" | "genre" | "description" | "cardColour" | "coverImage" | "pages" | "recommendedById" |
  "recommendedByName" | "isPrivate">;

// As sameBook compares titles and authors.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

// One reader's shelf in groups of copies of the same book (only groups of two or more).
function duplicateGroups(shelf: Copy[]) {
  const parent = new Map(shelf.map((b) => [b.id, b.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const buckets = new Map<string, Copy[]>();
  const add = (key: string, b: Copy) => buckets.set(key, [...(buckets.get(key) ?? []), b]);
  for (const b of shelf) {
    if (b.workId) add(`w:${b.workId}`, b);
    if (b.workKey) add(`k:${b.workKey}`, b);
    add(`t:${norm(b.title)}|${norm(b.author)}`, b);
  }
  for (const [key, books] of Array.from(buckets)) {
    for (let i = 1; i < books.length; i++) {
      for (let j = 0; j < i; j++) {
        // Same title and author is only the same book when at most one of them has a work key.
        if (!key.startsWith("t:") || sameBook(books[i], books[j])) union(books[i].id, books[j].id);
      }
    }
  }
  const groups = new Map<string, Copy[]>();
  for (const b of shelf) groups.set(find(b.id), [...(groups.get(find(b.id)) ?? []), b]);
  return Array.from(groups.values()).filter((g) => g.length > 1);
}

// Two different work keys that only joined up through a keyless copy, with no shared Work behind them.
function ambiguous(group: Copy[]) {
  const keys = new Set(group.flatMap((b) => (b.workKey ? [b.workKey] : [])));
  if (keys.size < 2) return false;
  const works = new Set(group.flatMap((b) => (b.workId ? [b.workId] : [])));
  return works.size !== 1 || group.some((b) => b.workKey && !b.workId);
}

const progress = (b: Copy) => Math.max(b.currentPage ?? 0, b.currentMinute ?? 0);
const touched = (b: Copy) => (b.progressAt ?? b.completedAt ?? b.startedAt)?.getTime() ?? 0;

function keeperOf(group: Copy[], inCircle: Set<string>) {
  return [...group].sort((a, b) =>
    Number(inCircle.has(b.id)) - Number(inCircle.has(a.id)) ||
    SHELF_RANK[b.status] - SHELF_RANK[a.status] ||
    progress(b) - progress(a) ||
    touched(b) - touched(a) ||
    (a.id < b.id ? -1 : 1),
  )[0];
}

// What the kept copy takes from the others where it has nothing of its own.
function filledIn(keep: Copy, others: Copy[]) {
  const data: Partial<Book> = {};
  const withReview = others.find((b) => b.review?.trim());
  if (!keep.review?.trim() && withReview) {
    Object.assign(data, { review: withReview.review, reviewSpoiler: withReview.reviewSpoiler, reviewPrivate: withReview.reviewPrivate, reviewHiddenAt: withReview.reviewHiddenAt });
  }
  const rated = others.find((b) => b.rating != null);
  if (keep.rating == null && rated) Object.assign(data, { rating: rated.rating, ratingHiddenAt: rated.ratingHiddenAt });
  const tags = Array.from(new Set([...keep.tags, ...others.flatMap((b) => b.tags)]));
  if (tags.length > keep.tags.length) data.tags = tags;
  for (const field of ["genre", "description", "cardColour", "coverImage", "workKey", "workId", "editionId"] as const) {
    const from = others.find((b) => b[field]);
    if (!keep[field] && from) (data as Record<string, unknown>)[field] = from[field];
  }
  if (!keep.pages) {
    const from = others.find((b) => b.pages);
    if (from) data.pages = from.pages;
  }
  if (!keep.recommendedById && !keep.recommendedByName) {
    const from = others.find((b) => b.recommendedById || b.recommendedByName);
    if (from) Object.assign(data, { recommendedById: from.recommendedById, recommendedByName: from.recommendedByName });
  }
  if (!keep.isPrivate && others.some((b) => b.isPrivate)) data.isPrivate = true;
  return data;
}

async function merge(keep: Copy, others: Copy[]) {
  const otherIds = others.map((b) => b.id);
  await prisma.$transaction(async (tx) => {
    // Reads: the finished and DNF ones come over unless the kept copy already has that read.
    const keptReads = await tx.bookRead.findMany({ where: { bookId: keep.id }, select: { status: true, startedAt: true, finishedAt: true } });
    const seen = new Set(keptReads.map((r) => `${r.status}|${day(r.startedAt)}|${day(r.finishedAt)}`));
    const theirReads = await tx.bookRead.findMany({ where: { bookId: { in: otherIds } }, orderBy: { createdAt: "asc" } });
    const moveReads: string[] = [];
    for (const r of theirReads) {
      const key = `${r.status}|${day(r.startedAt)}|${day(r.finishedAt)}`;
      if (OPEN.includes(r.status) || seen.has(key)) continue;
      seen.add(key);
      moveReads.push(r.id);
    }
    if (moveReads.length) await tx.bookRead.updateMany({ where: { id: { in: moveReads } }, data: { bookId: keep.id } });
    const timesRead = await tx.bookRead.count({ where: { bookId: keep.id, status: "COMPLETED" } });

    // Feed activity: one of each kind, so followers don't see "started Verity" twice.
    const kinds = new Set((await tx.activity.findMany({ where: { bookId: keep.id }, select: { type: true } })).map((a) => a.type));
    for (const a of await tx.activity.findMany({ where: { bookId: { in: otherIds } }, orderBy: { createdAt: "asc" } })) {
      if (kinds.has(a.type)) continue;
      kinds.add(a.type);
      await tx.activity.update({ where: { id: a.id }, data: { bookId: keep.id } });
    }

    const moved = { where: { bookId: { in: otherIds } }, data: { bookId: keep.id } };
    await tx.note.updateMany(moved);
    await tx.notification.updateMany(moved);
    await tx.buddyReadMember.updateMany(moved);
    await tx.recap.updateMany(moved);

    const user = await tx.user.findUnique({ where: { id: keep.userId }, select: { favouriteIds: true } });
    if (user && user.favouriteIds.some((id) => otherIds.includes(id))) {
      const favouriteIds = Array.from(new Set(user.favouriteIds.map((id) => (otherIds.includes(id) ? keep.id : id))));
      await tx.user.update({ where: { id: keep.userId }, data: { favouriteIds } });
    }

    await tx.book.update({ where: { id: keep.id }, data: { ...filledIn(keep, others), timesRead } });
    // Whatever wasn't moved (open reads, repeated activity) goes with them.
    await tx.book.deleteMany({ where: { id: { in: otherIds } } });
  }, { timeout: 30_000 });
}

async function main() {
  const copies: Copy[] = await prisma.book.findMany({
    select: {
      id: true, userId: true, title: true, author: true, workKey: true, workId: true, editionId: true, status: true,
      currentPage: true, currentMinute: true, progressAt: true, completedAt: true, startedAt: true, review: true,
      reviewSpoiler: true, reviewPrivate: true, reviewHiddenAt: true, rating: true, ratingHiddenAt: true, tags: true,
      genre: true, description: true, cardColour: true, coverImage: true, pages: true, recommendedById: true,
      recommendedByName: true, isPrivate: true,
    },
  });
  const shelves = new Map<string, Copy[]>();
  for (const b of copies) shelves.set(b.userId, [...(shelves.get(b.userId) ?? []), b]);

  const groups = Array.from(shelves.values()).flatMap(duplicateGroups);
  if (!groups.length) {
    console.log(`${copies.length} shelf copies, no duplicates`);
    return;
  }
  const ids = groups.flat().map((b) => b.id);
  const userIds = Array.from(new Set(groups.map((g) => g[0].userId)));
  const [users, importing, circles, reads, notes] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } }),
    prisma.importJob.findMany({ where: { userId: { in: userIds }, status: "importing" }, select: { userId: true } }),
    prisma.buddyReadMember.findMany({ where: { bookId: { in: ids } }, select: { bookId: true } }),
    prisma.bookRead.groupBy({ by: ["bookId"], where: { bookId: { in: ids } }, _count: { _all: true } }),
    prisma.note.groupBy({ by: ["bookId"], where: { bookId: { in: ids } }, _count: { _all: true } }),
  ]);
  const username = new Map(users.map((u) => [u.id, u.username ?? u.id]));
  const busy = new Set(importing.map((j) => j.userId));
  const inCircle = new Set(circles.map((m) => m.bookId));
  const readCount = new Map(reads.map((r) => [r.bookId, r._count._all]));
  const noteCount = new Map(notes.map((n) => [n.bookId, n._count._all]));

  console.log(`${groups.length} book(s) shelved more than once, ${groups.reduce((n, g) => n + g.length - 1, 0)} extra copies, across ${userIds.length} reader(s)${dryRun ? " (dry run, nothing is changed)" : ""}\n`);
  let merged = 0, skipped = 0;
  for (const group of groups) {
    const who = `@${username.get(group[0].userId)}`;
    const keep = keeperOf(group, inCircle);
    console.log(`${who}  "${group[0].title}" by ${group[0].author}  x${group.length}`);
    for (const b of group) {
      const extras = [inCircle.has(b.id) && "in a circle", b.review?.trim() && "review", b.rating != null && `rated ${b.rating}`, b.isPrivate && "private"].filter(Boolean);
      console.log(`  ${b.id === keep.id ? "keep  " : "merge "} ${b.id}  ${b.status.padEnd(14)} p.${progress(b)}  ${readCount.get(b.id) ?? 0} read(s), ${noteCount.get(b.id) ?? 0} note(s)${extras.length ? `  ${extras.join(", ")}` : ""}`);
    }
    if (busy.has(group[0].userId)) {
      console.log("  skipped: an import is still running for this reader\n");
      skipped++;
      continue;
    }
    if (ambiguous(group)) {
      console.log("  skipped: different Open Library works with no catalogue Work in common; check by hand\n");
      skipped++;
      continue;
    }
    if (!dryRun) await merge(keep, group.filter((b) => b.id !== keep.id));
    merged++;
    console.log("");
  }
  console.log(`${dryRun ? "would merge" : "merged"} ${merged} book(s)${skipped ? `, skipped ${skipped}` : ""}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
