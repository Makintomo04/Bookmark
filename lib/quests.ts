import { Prisma, Quest } from "@prisma/client";
import prisma from "@/lib/db";
import { sameBook } from "@/lib/workKey";
import {
  QuestGoal, QuestMedalDesign, QuestPhase, bookInGenre, describeGoal, isQuestKey, parseGoal, questIdOf, questKey, questPhase, trustedPages,
} from "@/lib/questRules";

// Seasonal quests, server side: which of a reader's finishes count, their progress, and the medal.
//
// Every reader is enrolled automatically. Progress comes from reads they log anyway, so there's nothing
// to opt into, nobody loses a medal for missing a "Join" button, and a reader who doesn't care never
// sees more than a card on Discover. QuestProgress is only written once a book has counted.

type Viewer = { id: string; isStaff?: boolean } | null;

// After a quest ends it's still checked for a week, so an import of reads genuinely finished inside
// the window (or a late sync) still counts. Reads finished after the end never do.
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
// Open Library lookups per evaluation, for the pages goal.
const PAGE_LOOKUPS_MAX = 40;

export const goalOf = (quest: Pick<Quest, "goal">): QuestGoal | null => parseGoal(quest.goal);

export const medalOf = (q: Pick<Quest, "medalColour" | "ribbonColour" | "medalIcon">): QuestMedalDesign => ({
  colour: q.medalColour,
  ribbon: q.ribbonColour,
  icon: q.medalIcon,
});

// ---- Finding quests ----------------------------------------------------------------------

const visibleTo = (viewer: Viewer): Prisma.QuestWhereInput => (viewer?.isStaff ? {} : { hidden: false });

export async function listQuests(viewer: Viewer, now = new Date()) {
  const quests = await prisma.quest.findMany({ where: visibleTo(viewer), orderBy: { startsAt: "desc" }, take: 100 });
  const byPhase: Record<QuestPhase, Quest[]> = { live: [], upcoming: [], ended: [] };
  for (const q of quests) byPhase[questPhase(q, now)].push(q);
  // Soonest first for live and upcoming; most recent first for ended.
  byPhase.live.sort((a, b) => +a.endsAt - +b.endsAt);
  byPhase.upcoming.sort((a, b) => +a.startsAt - +b.startsAt);
  return byPhase;
}

export async function findQuest(slug: string, viewer: Viewer) {
  const quest = await prisma.quest.findUnique({ where: { slug } });
  return quest && (!quest.hidden || viewer?.isStaff) ? quest : null;
}

// The live quest that ends soonest, for the Discover card.
export async function featuredQuest(now = new Date()) {
  return prisma.quest.findFirst({
    where: { hidden: false, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { endsAt: "asc" },
  });
}

export async function earnedCounts(questIds: string[]): Promise<Map<string, number>> {
  if (questIds.length === 0) return new Map();
  const groups = await prisma.questProgress.groupBy({
    by: ["questId"],
    where: { questId: { in: questIds }, completedAt: { not: null } },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.questId, g._count._all]));
}

export async function listTitles(quests: Pick<Quest, "goal">[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(quests.flatMap((q) => { const g = goalOf(q); return g?.type === "list" ? [g.listId] : []; })));
  if (ids.length === 0) return new Map();
  const lists = await prisma.list.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
  return new Map(lists.map((l) => [l.id, l.title]));
}

export function goalText(quest: Pick<Quest, "goal">, titles: Map<string, string>) {
  const goal = goalOf(quest);
  if (!goal) return "";
  return describeGoal(goal, goal.type === "list" ? titles.get(goal.listId) : null);
}

// ---- Which finishes count ----------------------------------------------------------------

export interface Finish {
  bookId: string;
  title: string;
  author: string;
  workKey: string | null;
  genre: string | null;
  pages: number;
  coverImage: string;
  cardColour: string | null;
  startedAt: Date | null;
  finishedAt: Date;
}

// When a Mongo ObjectId was minted. Native books get theirs on insert; imported books get the time
// the import started (lib/import/records.ts newObjectId), so for either it's when the book arrived.
const objectIdTime = (id: string) => new Date(parseInt(id.slice(0, 8), 16) * 1000);

// Every finish a reader made between `from` and `to`, oldest first.
//  - A finish is a COMPLETED BookRead's finishedAt. Books from before read history (no BookRead rows
//    at all) fall back to Book.completedAt, found through their COMPLETED_BOOK activity in the window.
//  - Imported books (the import posts no Activity, every native add does) count only through their
//    own dated reads, and only when that date isn't after the import itself: a CSV can carry a real
//    past finish into the window, but can't invent one from the future or borrow the import date.
//  - Re-reads and duplicate copies are all returned: a quest counts each work once, but only after its
//    own rules have picked the finishes that qualify (dedupeBooks), so a re-read started during the
//    quest still counts when an earlier read of the same book doesn't.
// Both range queries ride indexes (BookRead [userId, finishedAt], Activity [userId, createdAt]), so the
// cost is the window's finishes, not the reader's whole history.
export async function eligibleFinishes(userId: string, from: Date, to: Date, now = new Date()): Promise<Finish[]> {
  const until = to < now ? to : now;
  if (until < from) return [];
  const [reads, completions] = await Promise.all([
    prisma.bookRead.findMany({
      where: { userId, status: "COMPLETED", finishedAt: { gte: from, lte: until } },
      select: { bookId: true, startedAt: true, finishedAt: true },
    }),
    prisma.activity.findMany({
      where: { userId, type: "COMPLETED_BOOK", createdAt: { gte: from, lte: until } },
      select: { bookId: true },
    }),
  ]);

  const readBookIds = new Set(reads.map((r) => r.bookId));
  const legacyIds = Array.from(new Set(completions.flatMap((a) => (a.bookId && !readBookIds.has(a.bookId) ? [a.bookId] : []))));
  const legacyCandidates = legacyIds.length
    ? await prisma.book.findMany({
        where: { id: { in: legacyIds }, userId, status: "COMPLETED", completedAt: { gte: from, lte: until } },
        select: { id: true, startedAt: true, completedAt: true },
      })
    : [];
  const withHistory = legacyCandidates.length
    ? new Set((await prisma.bookRead.findMany({
        where: { bookId: { in: legacyCandidates.map((b) => b.id) } },
        select: { bookId: true },
        distinct: ["bookId"],
      })).map((r) => r.bookId))
    : new Set<string>();

  type Candidate = { bookId: string; startedAt: Date | null; finishedAt: Date; fromRead: boolean };
  const candidates: Candidate[] = [
    ...reads.map((r) => ({ bookId: r.bookId, startedAt: r.startedAt, finishedAt: r.finishedAt!, fromRead: true })),
    ...legacyCandidates
      .filter((b) => !withHistory.has(b.id))
      .map((b) => ({ bookId: b.id, startedAt: b.startedAt, finishedAt: b.completedAt!, fromRead: false })),
  ];
  if (candidates.length === 0) return [];

  const ids = Array.from(new Set(candidates.map((c) => c.bookId)));
  const [books, active] = await Promise.all([
    prisma.book.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, title: true, author: true, workKey: true, genre: true, pages: true, coverImage: true, cardColour: true },
    }),
    prisma.activity.findMany({ where: { bookId: { in: ids } }, select: { bookId: true }, distinct: ["bookId"] }),
  ]);
  const bookById = new Map(books.map((b) => [b.id, b]));
  const native = new Set(active.map((a) => a.bookId));

  const finishes: Finish[] = [];
  for (const c of candidates.sort((a, b) => +a.finishedAt - +b.finishedAt)) {
    const book = bookById.get(c.bookId);
    if (!book) continue;
    if (!native.has(c.bookId) && (!c.fromRead || c.finishedAt > objectIdTime(c.bookId))) continue;
    finishes.push({ ...book, bookId: book.id, startedAt: c.startedAt, finishedAt: c.finishedAt });
  }
  return finishes;
}

// ---- Open Library page counts ------------------------------------------------------------

// The median page count across a work's editions. Cached for a month; null when unknown or unreachable.
async function openLibraryPages(workKey: string): Promise<number | null> {
  try {
    const q = encodeURIComponent(`key:/works/${workKey}`);
    const res = await fetch(`https://openlibrary.org/search.json?q=${q}&fields=key,number_of_pages_median&limit=1`, {
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 2592000 },
    });
    if (!res.ok) return null;
    const pages = (await res.json())?.docs?.[0]?.number_of_pages_median;
    return typeof pages === "number" && pages > 0 ? pages : null;
  } catch {
    return null;
  }
}

async function pageCounts(finishes: Finish[]): Promise<Map<string, number | null>> {
  const keys = Array.from(new Set(finishes.flatMap((f) => (f.workKey ? [f.workKey] : [])))).slice(0, PAGE_LOOKUPS_MAX);
  const entries = await Promise.all(keys.map(async (k) => [k, await openLibraryPages(k)] as const));
  return new Map(entries);
}

// ---- Progress ----------------------------------------------------------------------------

interface GoalContext {
  listItems: Map<string, { workKey: string | null; title: string; author: string }[]>;
  pages: Map<string, number | null>;
}

function goalMatches(goal: QuestGoal, quest: Pick<Quest, "startsAt" | "endsAt">, f: Finish, ctx: GoalContext): boolean {
  if (f.finishedAt < quest.startsAt || f.finishedAt > quest.endsAt) return false;
  switch (goal.type) {
    case "list":
      return (ctx.listItems.get(goal.listId) ?? []).some((item) => sameBook(item, f));
    case "genre":
      return bookInGenre(f.genre, goal.genre);
    case "pages": {
      const pages = trustedPages(f.pages, f.workKey ? ctx.pages.get(f.workKey) : null);
      return pages !== null && pages >= goal.minPages;
    }
    case "startedInWindow":
      return !!f.startedAt && f.startedAt >= quest.startsAt && f.startedAt <= quest.endsAt;
  }
}

async function goalContext(quests: Quest[], finishes: Finish[]): Promise<GoalContext> {
  const goals = quests.map(goalOf);
  const listIds = Array.from(new Set(goals.flatMap((g) => (g?.type === "list" ? [g.listId] : []))));
  const [items, pages] = await Promise.all([
    listIds.length
      ? prisma.listItem.findMany({ where: { listId: { in: listIds } }, select: { listId: true, workKey: true, title: true, author: true } })
      : Promise.resolve([]),
    goals.some((g) => g?.type === "pages") ? pageCounts(finishes) : Promise.resolve(new Map<string, number | null>()),
  ]);
  const listItems = new Map<string, { workKey: string | null; title: string; author: string }[]>();
  for (const item of items) listItems.set(item.listId, [...(listItems.get(item.listId) ?? []), item]);
  return { listItems, pages };
}

// The first qualifying finish of each work: a re-read or a duplicate copy counts once.
function dedupeBooks(finishes: Finish[]): Finish[] {
  const kept: Finish[] = [];
  for (const f of finishes) if (!kept.some((k) => sameBook(k, f))) kept.push(f);
  return kept;
}

export interface QuestStanding {
  count: number;
  target: number;
  books: Finish[];
}

// Each quest's counted books, from one pass over the reader's finishes across all of their windows.
async function standings(userId: string, quests: Quest[], now = new Date()): Promise<Map<string, QuestStanding>> {
  const result = new Map<string, QuestStanding>();
  const scored = quests.filter((q) => goalOf(q));
  if (scored.length === 0) return result;
  const from = new Date(Math.min(...scored.map((q) => +q.startsAt)));
  const to = new Date(Math.max(...scored.map((q) => +q.endsAt)));
  const finishes = await eligibleFinishes(userId, from, to, now);
  const ctx = await goalContext(scored, finishes);
  for (const quest of scored) {
    const goal = goalOf(quest)!;
    const books = dedupeBooks(finishes.filter((f) => goalMatches(goal, quest, f, ctx)));
    result.set(quest.id, { count: books.length, target: goal.count, books });
  }
  return result;
}

export async function questStanding(userId: string, quest: Quest): Promise<QuestStanding | null> {
  return (await standings(userId, [quest])).get(quest.id) ?? null;
}

// ---- Awarding ----------------------------------------------------------------------------

export interface EarnedQuestMedal {
  questId: string;
  slug: string;
  title: string;
}

// Called from syncAchievements on completion (and "all"). Checks only live quests (plus a week's
// grace) that the reader hasn't earned, records progress that changed, and awards finished ones:
// a UserAchievement "QUEST:<id>" (kept for good, whatever happens to the quest) and a notification.
export async function syncQuests(userId: string, earnedKeys: Set<string>, now = new Date()): Promise<EarnedQuestMedal[]> {
  const quests = (await prisma.quest.findMany({
    where: { hidden: false, startsAt: { lte: now }, endsAt: { gte: new Date(+now - GRACE_MS) } },
  })).filter((q) => !earnedKeys.has(questKey(q.id)));
  if (quests.length === 0) return [];

  const [results, existing] = await Promise.all([
    standings(userId, quests, now),
    prisma.questProgress.findMany({ where: { userId, questId: { in: quests.map((q) => q.id) } } }),
  ]);
  const existingByQuest = new Map(existing.map((p) => [p.questId, p]));

  const earned: EarnedQuestMedal[] = [];
  for (const quest of quests) {
    const standing = results.get(quest.id);
    if (!standing) continue;
    const bookIds = standing.books.map((b) => b.bookId);
    const done = standing.count >= standing.target;
    const previous = existingByQuest.get(quest.id);

    if (done) {
      try {
        await prisma.userAchievement.create({ data: { userId, key: questKey(quest.id) } });
      } catch (e) {
        // A concurrent request awarded it first.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        continue;
      }
      earned.push({ questId: quest.id, slug: quest.slug, title: quest.title });
    }

    const changed = !previous || previous.count !== standing.count || previous.bookIds.join() !== bookIds.join() || (done && !previous.completedAt);
    if (changed && (standing.count > 0 || previous)) {
      const data = { count: standing.count, bookIds, ...(done && { completedAt: now }) };
      await prisma.questProgress.upsert({
        where: { questId_userId: { questId: quest.id, userId } },
        create: { questId: quest.id, userId, ...data },
        update: data,
      });
    }
  }

  if (earned.length > 0) {
    await prisma.notification.createMany({
      data: earned.map((q) => ({ userId, actorId: userId, type: "QUEST_COMPLETED" as const, achievementKey: questKey(q.questId) })),
    });
  }
  return earned;
}

// ---- Medals for display ------------------------------------------------------------------

export interface QuestMedalInfo extends QuestMedalDesign {
  questId: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  earnedAt: string | null;
}

// The quest medals behind a set of UserAchievement rows (a profile's, say), newest first.
// Hidden or ended quests still show: a medal, once earned, is kept.
export async function questMedals(earned: { key: string; earnedAt: Date | string }[]): Promise<QuestMedalInfo[]> {
  const when = new Map(earned.filter((e) => isQuestKey(e.key)).map((e) => [questIdOf(e.key)!, new Date(e.earnedAt)]));
  const ids = Array.from(when.keys()).filter((id) => /^[a-f0-9]{24}$/.test(id));
  if (ids.length === 0) return [];
  const quests = await prisma.quest.findMany({ where: { id: { in: ids } } });
  return quests
    .map((q) => ({
      ...medalOf(q),
      questId: q.id,
      slug: q.slug,
      title: q.title,
      startsAt: q.startsAt.toISOString(),
      endsAt: q.endsAt.toISOString(),
      earnedAt: when.get(q.id)?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""));
}

// Quest medals in the shape /api/achievements returns: every medal the reader has earned, plus the
// live quests they haven't finished yet (locked, with their progress). One rung each.
export async function questAchievementItems(userId: string, earned: { key: string; earnedAt: Date }[], now = new Date()) {
  const earnedById = new Map(earned.filter((e) => isQuestKey(e.key)).map((e) => [questIdOf(e.key)!, e.earnedAt]));
  const earnedIds = Array.from(earnedById.keys()).filter((id) => /^[a-f0-9]{24}$/.test(id));
  const quests = await prisma.quest.findMany({
    where: { OR: [{ id: { in: earnedIds } }, { hidden: false, startsAt: { lte: now }, endsAt: { gte: now } }] },
    orderBy: { startsAt: "desc" },
  });
  if (quests.length === 0) return [];
  const [titles, progress] = await Promise.all([
    listTitles(quests),
    prisma.questProgress.findMany({ where: { userId, questId: { in: quests.map((q) => q.id) } }, select: { questId: true, count: true } }),
  ]);
  const countFor = new Map(progress.map((p) => [p.questId, p.count]));

  return quests.map((q) => {
    const target = goalOf(q)?.count ?? 1;
    const earnedAt = earnedById.get(q.id) ?? null;
    return {
      key: questKey(q.id),
      title: q.title,
      category: "quests",
      current: earnedAt ? Math.max(target, countFor.get(q.id) ?? 0) : countFor.get(q.id) ?? 0,
      milestones: [{ value: target, title: q.title, description: goalText(q, titles), earned: !!earnedAt, earnedAt }],
      quest: {
        ...medalOf(q),
        slug: q.slug,
        startsAt: q.startsAt.toISOString(),
        endsAt: q.endsAt.toISOString(),
        phase: questPhase(q, now),
      },
    };
  });
}
