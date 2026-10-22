import type { EditionFormat } from "@prisma/client";
import prisma from "@/lib/db";
import { followedPeople, publicPerson } from "@/lib/lists";
import { blockedUserIds, canView, privacyOf, privacySelect } from "@/lib/privacy";
import { aggregateTags } from "@/lib/workTags";
import { searchTerms, type AskFormat, type CatalogCandidate, type CatalogSource, type FriendSignal, type ShelfIntent, type SignalPerson } from "@/lib/askShelf";

// The database side of Ask the shelf (lib/askShelf.ts): which works might match, the reader's shelf,
// and the friend signals.
//
// Retrieval is a structured filter plus text scoring, not Atlas $vectorSearch: vector search needs an
// embedding for every work (Anthropic has no embeddings endpoint and no other provider is set up) and
// an Atlas Search index, which `prisma db push` can't create. Here the database does a first pass (a
// case-insensitive whole-word match of the search's words against subjects, description and title,
// plus every work readers tagged with a wanted mood) and lib/askShelf.ts scores what comes back.

// First-pass candidates scored per search. The catalog is small enough today that this is everything
// that matches; at a few hundred thousand works this is the place to move to a search index.
const CANDIDATES_MAX = 500;
// Reader tag rows read per search, across the candidates.
const TAG_ROWS_MAX = 5000;
const SIGNAL_PEOPLE_MAX = 3;
// Circle-mates' books count when they finished them and didn't rate them below this.
const CIRCLE_MIN_RATING = 3;

const FORMAT_OF: Record<EditionFormat, AskFormat> = { PAPERBACK: "print", HARDCOVER: "print", EBOOK: "ebook", AUDIOBOOK: "audiobook" };

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const oid = (raw: unknown) => {
  const id = (raw as { _id?: { $oid?: string } })?._id?.$oid;
  return typeof id === "string" ? id : null;
};

async function candidateIds(intent: ShelfIntent): Promise<string[]> {
  const terms = searchTerms(intent);
  const ids = new Set<string>();

  if (terms.length > 0) {
    const pattern = `(^|[^a-z0-9])(${terms.map(escape).join("|")})`;
    const regex = { $regex: pattern, $options: "i" };
    const rows = await prisma.work.aggregateRaw({
      pipeline: [
        { $match: { $or: [{ subjects: regex }, { description: regex }, { title: regex }] } },
        { $project: { _id: 1 } },
        { $limit: CANDIDATES_MAX },
      ],
    });
    for (const row of rows as unknown as unknown[]) {
      const id = oid(row);
      if (id) ids.add(id);
    }
  }

  if (intent.moods.length > 0 && ids.size < CANDIDATES_MAX) {
    const tagged = await prisma.readerTags.findMany({
      where: { moods: { hasSome: intent.moods } },
      select: { workId: true },
      take: CANDIDATES_MAX,
    });
    for (const t of tagged) if (ids.size < CANDIDATES_MAX) ids.add(t.workId);
  }
  return Array.from(ids);
}

async function loadCandidates(intent: ShelfIntent): Promise<CatalogCandidate[]> {
  const ids = await candidateIds(intent);
  if (ids.length === 0) return [];

  const [works, editions, tagRows] = await Promise.all([
    prisma.work.findMany({
      where: { id: { in: ids } },
      select: { id: true, openLibraryKey: true, title: true, authors: true, description: true, subjects: true, coverUrl: true, firstPublishYear: true, seriesName: true, seriesPosition: true },
    }),
    prisma.edition.findMany({ where: { workId: { in: ids } }, select: { workId: true, pages: true, format: true } }),
    prisma.readerTags.findMany({ where: { workId: { in: ids } }, select: { workId: true, userId: true, moods: true, warnings: true }, take: TAG_ROWS_MAX }),
  ]);

  // Tags from deleted accounts don't count (the same rule as /api/works/tags).
  const live = new Set(
    (await prisma.user.findMany({ where: { id: { in: Array.from(new Set(tagRows.map((r) => r.userId))) } }, select: { id: true } })).map((u) => u.id),
  );
  const tagsByWork = new Map<string, typeof tagRows>();
  for (const row of tagRows) {
    if (!live.has(row.userId)) continue;
    const list = tagsByWork.get(row.workId) ?? [];
    list.push(row);
    tagsByWork.set(row.workId, list);
  }
  const editionsByWork = new Map<string, typeof editions>();
  for (const e of editions) {
    const list = editionsByWork.get(e.workId) ?? [];
    list.push(e);
    editionsByWork.set(e.workId, list);
  }

  return works.map((w) => {
    const eds = editionsByWork.get(w.id) ?? [];
    const tags = aggregateTags(tagsByWork.get(w.id) ?? []);
    return {
      workId: w.id,
      workKey: w.openLibraryKey,
      title: w.title,
      authors: w.authors,
      description: w.description,
      subjects: w.subjects,
      coverUrl: w.coverUrl,
      pages: median(eds.map((e) => e.pages ?? 0).filter((p) => p > 0)),
      formats: Array.from(new Set(eds.flatMap((e) => (e.format ? [FORMAT_OF[e.format]] : [])))),
      year: w.firstPublishYear,
      seriesName: w.seriesName,
      seriesPosition: w.seriesPosition,
      tagReaders: tags.readers,
      moods: tags.moods,
      warnings: tags.warnings,
    };
  });
}

const person = ({ username, image, favColour }: SignalPerson): SignalPerson => ({ username, image, favColour });

// Which candidate a shelf book is: by workId, or by Open Library key for books shelved before the catalog.
function workResolver(candidates: CatalogCandidate[]) {
  const ids = new Set(candidates.map((c) => c.workId));
  const byKey = new Map(candidates.filter((c) => c.workKey).map((c) => [c.workKey as string, c.workId]));
  return (book: { workId: string | null; workKey: string | null }) =>
    (book.workId && ids.has(book.workId) ? book.workId : null) ?? (book.workKey ? byKey.get(book.workKey) ?? null : null);
}

const bookWhere = (candidates: CatalogCandidate[]) => ({
  OR: [
    { workId: { in: candidates.map((c) => c.workId) } },
    { workKey: { in: candidates.flatMap((c) => (c.workKey ? [c.workKey] : [])) } },
  ],
});

// Books rated 4+ by people the reader follows (and may see), by work.
async function followedSignals(userId: string, candidates: CatalogCandidate[], signals: Map<string, FriendSignal>) {
  const { people } = await followedPeople(userId);
  if (people.size === 0) return;
  const resolve = workResolver(candidates);
  const books = await prisma.book.findMany({
    where: { userId: { in: Array.from(people.keys()) }, rating: { gte: 4 }, ...bookWhere(candidates) },
    select: { userId: true, workId: true, workKey: true, rating: true },
    orderBy: { rating: "desc" },
  });
  for (const book of books) {
    const workId = resolve(book);
    const who = people.get(book.userId);
    if (!workId || !who) continue;
    const existing = signals.get(workId);
    const shown = person(publicPerson(who));
    if (existing?.kind === "followed") {
      if (existing.people.length < SIGNAL_PEOPLE_MAX && !existing.people.some((p) => p.username === shown.username)) existing.people.push(shown);
      existing.rating = Math.max(existing.rating, book.rating ?? 0);
    } else {
      signals.set(workId, { kind: "followed", people: [shown], rating: book.rating ?? 4 });
    }
  }
}

// Books read in the reader's circles: each circle's own book, and books the other members finished
// (only members whose profile the reader may see; blocks either way leave them out).
async function circleSignals(userId: string, candidates: CatalogCandidate[], signals: Map<string, FriendSignal>) {
  const memberships = await prisma.buddyReadMember.findMany({ where: { userId }, select: { buddyReadId: true } });
  if (memberships.length === 0) return;
  const circleIds = memberships.map((m) => m.buddyReadId);
  const resolve = workResolver(candidates);

  const [circles, mates, blocked] = await Promise.all([
    prisma.buddyRead.findMany({ where: { id: { in: circleIds } }, select: { workKey: true } }),
    prisma.buddyReadMember.findMany({ where: { buddyReadId: { in: circleIds }, userId: { not: userId } }, select: { userId: true } }),
    blockedUserIds(userId),
  ]);

  for (const circle of circles) {
    const workId = circle.workKey ? resolve({ workId: null, workKey: circle.workKey }) : null;
    if (workId && !signals.has(workId)) signals.set(workId, { kind: "circle", people: [], count: 0, together: true });
  }

  const blockedIds = new Set(blocked);
  const mateIds = Array.from(new Set(mates.map((m) => m.userId))).filter((id) => !blockedIds.has(id));
  if (mateIds.length === 0) return;
  const [users, follows] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: mateIds } }, select: { id: true, username: true, image: true, favColour: true, ...privacySelect } }),
    prisma.follow.findMany({ where: { followerId: userId, followingId: { in: mateIds } }, select: { followingId: true } }),
  ]);
  const followed = new Set(follows.map((f) => f.followingId));
  const visible = new Map(
    users
      .filter((u) => canView({ isSelf: false, isFollower: followed.has(u.id), blocked: null }, privacyOf(u), "profile"))
      .map((u) => [u.id, person(u)]),
  );
  if (visible.size === 0) return;

  const books = await prisma.book.findMany({
    where: {
      userId: { in: Array.from(visible.keys()) },
      status: "COMPLETED",
      OR: [{ rating: null }, { rating: { isSet: false } }, { rating: { gte: CIRCLE_MIN_RATING } }],
      AND: [bookWhere(candidates)],
    },
    select: { userId: true, workId: true, workKey: true },
  });
  for (const book of books) {
    const workId = resolve(book);
    const who = visible.get(book.userId);
    if (!workId || !who) continue;
    const existing = signals.get(workId);
    if (existing?.kind === "followed") continue;
    if (existing?.kind === "circle") {
      if (existing.people.some((p) => p.username === who.username)) continue;
      existing.count++;
      if (existing.people.length < SIGNAL_PEOPLE_MAX) existing.people.push(who);
    } else {
      signals.set(workId, { kind: "circle", people: [who], count: 1, together: false });
    }
  }
}

export const prismaAskCatalog: CatalogSource = {
  candidates: loadCandidates,
  async shelf(userId) {
    return prisma.book.findMany({ where: { userId }, select: { workId: true, workKey: true, status: true } });
  },
  async signals(userId, candidates) {
    const signals = new Map<string, FriendSignal>();
    if (candidates.length === 0) return signals;
    // Followed first: a book with both signals shows the stronger one.
    await followedSignals(userId, candidates, signals);
    await circleSignals(userId, candidates, signals);
    return signals;
  },
};
