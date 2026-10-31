import { cache } from "react";
import { findUserByUsername } from "@/lib/userLookup";
import { goalProgress, monthlyPace, type GoalProgress } from "@/lib/goals";
import { readLength } from "@/lib/progress";
import prisma from "@/lib/db";
import { getMilestone } from "@/lib/achievements-catalog";
import { getReadingStreak } from "@/lib/achievements";
import { getReaderTier } from "@/lib/readerTier";
import { DEFAULT_TIME_ZONE, finishDay, isValidTimeZone, localDay } from "@/lib/timeZone";
import { isWrappedSeason } from "@/lib/wrappedSeason";
import { isProfilePublic, sharedBookWhere } from "@/lib/privacy";
import type { BookSummary, Tally, PeriodCount, GoalResult, ReadingStats, WrappedMedal, WrappedData, WrapCardData } from "@bookmark/shared/statsTypes";
import type { Mood } from "@bookmark/shared/workTags";
import { cardPeriodKeys } from "@bookmark/shared/wrapCards";
import type { DateRange, ExplorerFinish, ExplorerFormat } from "@bookmark/shared/statsExplorer";
export type { BookSummary, Tally, PeriodCount, GoalResult, ReadingStats, WrappedMedal, WrappedData, WrapCardData };

export { isWrappedSeason };

// Reading stats for /stats and Bookmark Wrapped. Everything is free, and everything is keyed by
// userId so the same functions can back a public stats tab later.
//
// A "finish" is one completed read. BookRead holds them; books shelved before BookRead existed
// (or before scripts/backfill-reads.ts runs) fall back to the book's own fields: timesRead
// completed reads, the latest dated by Book.completedAt and the rest undated. So a re-read in the
// same year counts twice, and undated finishes count toward totals but not toward any year.
//
// Years and months are the reader's calendar, in their stored time zone (UTC without one).

const TOP = 8;
const STAR_STEPS = Array.from({ length: 10 }, (_, i) => (i + 1) / 2);

interface Finish {
  book: BookSummary;
  outcome: "COMPLETED" | "DNF";
  // When this read began, if it has a date: for days to finish.
  startedAt: Date | null;
  // The work's first publish year, from the catalogue.
  published: number | null;
  year: number | null;
  month: number | null; // 0 to 11
  // The reader's calendar day, "YYYY-MM-DD": what the stats explorer's ranges count in.
  day: string | null;
  at: Date | null;
  // How this read was taken in, for the explorer's format filter: minutes listened make it an audiobook,
  // otherwise the shelved edition's format says ebook or print.
  format: ExplorerFormat;
  rating: number | null;
  // What this read adds: pages if read on paper or screen, minutes if listened to. A re-read in another
  // format counts in that format, not in whatever the book is now.
  pages: number;
  minutes: number;
}

// ---- Loading ---------------------------------------------------------------------------------

const bookSelect = {
  id: true,
  title: true,
  author: true,
  pages: true,
  progressUnit: true,
  audioMinutes: true,
  coverImage: true,
  cardColour: true,
  genre: true,
  rating: true,
  status: true,
  timesRead: true,
  completedAt: true,
  stoppedAt: true,
  startedAt: true,
  workId: true,
  work: { select: { firstPublishYear: true } },
  edition: { select: { format: true } },
} as const;

// Four narrow queries, in parallel: the reader's zone, their books (no descriptions or reviews),
// the reads that ended, and their goals. Everything else is worked out from these on the server.
// `sharedOnly` leaves private books out, for anything someone other than the reader sees; their reads
// only count through their book, so they drop out with it.
async function loadReadingData(userId: string, sharedOnly = false) {
  const [user, books, reads, goals] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } }),
    prisma.book.findMany({ where: sharedOnly ? { userId, ...sharedBookWhere } : { userId }, select: bookSelect }),
    prisma.bookRead.findMany({
      where: { userId, status: { in: ["COMPLETED", "DNF"] } },
      select: { bookId: true, status: true, startedAt: true, finishedAt: true, rating: true, pages: true, progressUnit: true, audioMinutes: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.readingGoal.findMany({ where: { userId, targetBooks: { gt: 0 } }, select: { year: true, targetBooks: true, targetPages: true, targetBooksPerMonth: true } }),
  ]);

  const timeZone = user?.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : DEFAULT_TIME_ZONE;
  const place = (at: Date | null) => {
    if (!at) return { year: null, month: null, day: null };
    const day = finishDay(at, timeZone);
    return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1, day };
  };
  const formatOf = (length: { minutes: number }, edition: { format: string | null } | null): ExplorerFormat =>
    length.minutes > 0 ? "AUDIOBOOK" : edition?.format === "EBOOK" ? "EBOOK" : "PRINT";

  const readsByBook = new Map<string, typeof reads>();
  for (const r of reads) {
    const list = readsByBook.get(r.bookId);
    if (list) list.push(r);
    else readsByBook.set(r.bookId, [r]);
  }

  const finishes: Finish[] = [];
  const summaries = new Map<string, BookSummary>();
  for (const b of books) {
    const book: BookSummary = {
      id: b.id,
      title: b.title,
      author: b.author,
      pages: b.pages,
      audioMinutes: b.progressUnit === "MINUTES" && b.audioMinutes ? b.audioMinutes : null,
      coverImage: b.coverImage,
      cardColour: b.cardColour,
      genre: b.genre,
    };
    summaries.set(b.id, book);
    const published = b.work?.firstPublishYear ?? null;
    const own = readsByBook.get(b.id);
    if (own) {
      for (const r of own) {
        const length = readLength(r, b);
        finishes.push({ book, outcome: r.status as Finish["outcome"], at: r.finishedAt, startedAt: r.startedAt, published, ...place(r.finishedAt), rating: r.rating ?? b.rating, ...length, format: formatOf(length, b.edition) });
      }
      continue;
    }
    // No history rows yet: what the book's own fields imply.
    const length = readLength({}, b);
    const format = formatOf(length, b.edition);
    const completed = Math.max(b.timesRead, b.status === "COMPLETED" ? 1 : 0);
    for (let i = 0; i < completed; i++) {
      const latest = i === completed - 1;
      const at = latest ? b.completedAt : null;
      finishes.push({ book, outcome: "COMPLETED", at, startedAt: latest && b.status === "COMPLETED" ? b.startedAt : null, published, ...place(at), rating: b.rating, ...length, format });
    }
    if (b.status === "DNF") finishes.push({ book, outcome: "DNF", at: b.stoppedAt, startedAt: null, published, ...place(b.stoppedAt), rating: b.rating, ...length, format });
  }

  return {
    timeZone,
    books,
    finishes,
    goals,
    currentYear: Number(localDay(new Date(), timeZone).slice(0, 4)),
    currentMonth: Number(localDay(new Date(), timeZone).slice(5, 7)) - 1,
    // Books finished at least once, re-reads included: what the reader tier counts (lib/readerTier.ts).
    completedBooks: books.filter((b) => b.status === "COMPLETED" || b.timesRead >= 1).length,
  };
}

// Shared by the page, generateMetadata and the share images within one request.
const readingData = cache(loadReadingData);

// ---- Helpers ---------------------------------------------------------------------------------

function tally(values: (string | null | undefined)[], limit = TOP): Tally[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const raw of values) {
    const name = raw?.trim();
    if (!name) continue;
    // "ursula k. le guin" and "Ursula K. Le Guin" are the same author.
    const key = name.toLocaleLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { name, count: 1 });
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function distinctBooks(finishes: Finish[]): BookSummary[] {
  const seen = new Map<string, BookSummary>();
  for (const f of finishes) seen.set(f.book.id, f.book);
  return Array.from(seen.values());
}

function longest(books: BookSummary[]): BookSummary | null {
  return books.reduce<BookSummary | null>((best, b) => (b.pages > 0 && (!best || b.pages > best.pages) ? b : best), null);
}

function averageLength(books: BookSummary[]): number | null {
  const sized = books.filter((b) => b.pages > 0);
  return sized.length ? Math.round(sized.reduce((sum, b) => sum + b.pages, 0) / sized.length) : null;
}

const emptyMonths = (): PeriodCount[] => Array.from({ length: 12 }, () => ({ books: 0, pages: 0 }));

// Length buckets for the "How long" chart: pages for books read, hours for audiobooks. `min` is the
// bucket's lower bound, so the chart can link each to a sorted shelf later.
const PAGE_BUCKETS = [{ label: "Under 200", min: 0 }, { label: "200–299", min: 200 }, { label: "300–399", min: 300 }, { label: "400–499", min: 400 }, { label: "500+", min: 500 }];
const HOUR_BUCKETS = [{ label: "Under 5h", min: 0 }, { label: "5–10h", min: 300 }, { label: "10–15h", min: 600 }, { label: "15h+", min: 900 }];

function bucketed(values: number[], buckets: { label: string; min: number }[]) {
  const counts = buckets.map((b) => ({ ...b, count: 0 }));
  for (const v of values) {
    for (let i = counts.length - 1; i >= 0; i--) {
      if (v >= counts[i].min) { counts[i].count++; break; }
    }
  }
  return counts;
}

const DAY = 86_400_000;

// Days from start to finish, counting both: started and finished the same day is one day.
const daysBetween = (start: Date, end: Date) => Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY) + 1);

// Decades, quickest and slowest reads, lengths and the most re-read book: the extra stats for big shelves.
function shelfShape(completed: Finish[]) {
  // One entry per book for the shape of the shelf (decades, lengths); every read for the timings.
  const byBook = new Map<string, Finish>();
  for (const f of completed) byBook.set(f.book.id, f);
  const books = Array.from(byBook.values());

  const decadeCounts = new Map<number, number>();
  for (const f of books) {
    if (!f.published || f.published < 1000) continue;
    const decade = Math.floor(f.published / 10) * 10;
    decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
  }
  const decades = Array.from(decadeCounts, ([decade, count]) => ({ decade, count })).sort((a, b) => a.decade - b.decade);

  const lengths = bucketed(books.filter((f) => f.pages > 0).map((f) => f.pages), PAGE_BUCKETS);
  const listenLengths = bucketed(books.filter((f) => f.minutes > 0).map((f) => f.minutes), HOUR_BUCKETS);

  const timed = completed
    .filter((f) => f.startedAt && f.at && f.at.getTime() >= f.startedAt.getTime())
    .map((f) => ({ book: f.book, days: daysBetween(f.startedAt!, f.at!) }));
  const daysToFinish = timed.length ? {
    reads: timed.length,
    average: Math.round((timed.reduce((s, t) => s + t.days, 0) / timed.length) * 10) / 10,
    fastest: timed.reduce((best, t) => (t.days < best.days ? t : best)),
    slowest: timed.reduce((worst, t) => (t.days > worst.days ? t : worst)),
  } : null;

  const times = new Map<string, number>();
  for (const f of completed) times.set(f.book.id, (times.get(f.book.id) ?? 0) + 1);
  let mostReread: { book: BookSummary; times: number } | null = null;
  for (const [id, n] of Array.from(times)) if (n > 1 && (!mostReread || n > mostReread.times)) mostReread = { book: byBook.get(id)!.book, times: n };

  return { decades, lengths, listenLengths, daysToFinish, mostReread };
}

// ---- /stats -----------------------------------------------------------------------------------

export async function getReadingStats(userId: string): Promise<ReadingStats> {
  const [data, streak] = await Promise.all([readingData(userId), getReadingStreak(userId)]);
  const { finishes, books, goals, currentYear, currentMonth, timeZone } = data;

  const completed = finishes.filter((f) => f.outcome === "COMPLETED");
  const dnf = finishes.length - completed.length;
  const finished = distinctBooks(completed);

  const perBook = new Map<string, number>();
  for (const f of completed) perBook.set(f.book.id, (perBook.get(f.book.id) ?? 0) + 1);
  const rereadCounts = Array.from(perBook.values()).filter((n) => n > 1);

  // Years and months from dated finishes.
  const months: Record<number, PeriodCount[]> = {};
  for (const f of completed) {
    if (f.year === null || f.month === null) continue;
    const m = (months[f.year] ??= emptyMonths())[f.month];
    m.books++;
    m.pages += f.pages;
  }
  const datedYears = Object.keys(months).map(Number);
  const firstYear = datedYears.length ? Math.min(...datedYears, currentYear) : currentYear;
  const years: ReadingStats["years"] = [];
  for (let y = firstYear; y <= Math.max(currentYear, ...datedYears); y++) {
    months[y] ??= emptyMonths();
    years.push({ year: y, books: months[y].reduce((s, m) => s + m.books, 0), pages: months[y].reduce((s, m) => s + m.pages, 0) });
  }

  // Ratings are the reader's current rating for each book. The chart has a column per half star, so a
  // quarter counts with the half below it (4¾ under 4½), and ¼ under ½.
  const rated = books.filter((b) => b.rating && b.rating > 0);
  const bucket = (rating: number) => Math.max(0.5, Math.floor(rating * 2) / 2);
  const ratings = STAR_STEPS.map((rating) => ({ rating, count: rated.filter((b) => bucket(b.rating!) === rating).length }));

  const finishesInYear = (year: number) => completed.filter((f) => f.year === year).length;

  return {
    timeZone,
    booksRead: finished.length,
    finishes: completed.length,
    pagesRead: completed.reduce((sum, f) => sum + f.pages, 0),
    minutesListened: completed.reduce((sum, f) => sum + f.minutes, 0),
    undatedFinishes: completed.filter((f) => f.year === null).length,
    rereads: rereadCounts.reduce((sum, n) => sum + n - 1, 0),
    rereadBooks: rereadCounts.length,
    dnf,
    dnfRate: finishes.length ? dnf / finishes.length : null,
    averagePages: averageLength(finished),
    longestBook: longest(finished),
    ratedBooks: rated.length,
    averageRating: rated.length ? Math.round((rated.reduce((s, b) => s + b.rating!, 0) / rated.length) * 10) / 10 : null,
    ratings,
    genres: tally(finished.map((b) => b.genre)),
    authors: tally(finished.map((b) => b.author)),
    years,
    months,
    goals: goals
      .map((g): GoalResult => {
        const done = finishesInYear(g.year);
        const inYear = months[g.year] ?? emptyMonths();
        // This year counts the months that have started; a past year counts all twelve.
        const counted = g.year < currentYear ? 12 : g.year === currentYear ? currentMonth + 1 : 0;
        const pace = monthlyPace(g);
        return {
          year: g.year,
          target: g.targetBooks,
          completed: done,
          met: done >= g.targetBooks,
          targetPages: g.targetPages ?? null,
          pages: inYear.reduce((s, m) => s + m.pages, 0),
          targetBooksPerMonth: g.targetBooksPerMonth ?? null,
          pacePerMonth: pace.perMonth,
          paceIsCustom: pace.custom,
          monthsMet: inYear.slice(0, counted).filter((m) => m.books >= pace.perMonth).length,
          monthsCounted: counted,
        };
      })
      .sort((a, b) => b.year - a.year),
    streak,
    ...shelfShape(completed),
  };
}

// ---- The goal widget -------------------------------------------------------------------------

// The profile goal widget's numbers, from the same dated finishes as /stats: re-reads count, a book
// being re-read keeps its earlier finish, and the calendar is the reader's time zone.
// Counted as readingData counts it, so it agrees with /stats, but without loading the whole library: only the
// reads finished in that year, and the books with no reads kept yet whose last finish falls in it. The window is a
// day wider each side, since the year is the reader's own; localDay then places each finish exactly. With `setAt`
// (when the goal was set) it also says how many of the year's books came before it, where the goal's pace starts.
export async function getGoalProgress(userId: string, year: number, setAt?: Date): Promise<GoalProgress & { beforeGoal?: number }> {
  const DAY = 86_400_000;
  const window = { gte: new Date(Date.UTC(year, 0, 1) - DAY), lt: new Date(Date.UTC(year + 1, 0, 1) + DAY) };
  const lengthSelect = { pages: true, progressUnit: true, audioMinutes: true } as const;
  const [user, reads, unrecorded] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } }),
    prisma.bookRead.findMany({
      where: { userId, status: "COMPLETED", finishedAt: window, book: { userId } },
      select: { finishedAt: true, ...lengthSelect, book: { select: lengthSelect } },
    }),
    prisma.book.findMany({
      where: { userId, completedAt: window, OR: [{ status: "COMPLETED" }, { timesRead: { gte: 1 } }], reads: { none: { status: { in: ["COMPLETED", "DNF"] } } } },
      select: { completedAt: true, ...lengthSelect },
    }),
  ]);

  const timeZone = user?.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : DEFAULT_TIME_ZONE;
  const place = (at: Date) => {
    const day = finishDay(at, timeZone);
    return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 };
  };
  const finishes = [
    ...reads.map((r) => ({ at: r.finishedAt!, ...place(r.finishedAt!), pages: readLength(r, r.book).pages })),
    ...unrecorded.map((b) => ({ at: b.completedAt!, ...place(b.completedAt!), pages: readLength({}, b).pages })),
  ];

  const today = localDay(new Date(), timeZone);
  const currentYear = Number(today.slice(0, 4));
  const month = year === currentYear ? Number(today.slice(5, 7)) - 1 : year < currentYear ? 11 : 0;
  const progress = goalProgress(finishes, year, month);
  if (!setAt) return progress;
  return { ...progress, beforeGoal: finishes.filter((f) => f.year === year && f.at < setAt).length };
}

// ---- Wrapped ----------------------------------------------------------------------------------

// A year's Wrapped, or with `month` (0 to 11) one month of it: the same numbers for that month only,
// which the monthly share card (Plus) draws. `sharedOnly` for anyone but the reader: private books left out.
export async function getWrapped(userId: string, year: number, month: number | null = null, { sharedOnly = false } = {}): Promise<WrappedData> {
  const [data, earned] = await Promise.all([
    readingData(userId, sharedOnly),
    prisma.userAchievement.findMany({ where: { userId }, select: { key: true, earnedAt: true }, orderBy: { earnedAt: "asc" } }),
  ]);
  const { finishes, goals, currentYear, timeZone, completedBooks } = data;

  const inPeriod = (f: Finish) => f.year === year && (month === null || f.month === month);
  const inYear = finishes.filter(inPeriod).sort((a, b) => a.at!.getTime() - b.at!.getTime());
  const completed = inYear.filter((f) => f.outcome === "COMPLETED");
  const finished = distinctBooks(completed);

  const months = emptyMonths();
  for (const f of completed) {
    months[f.month!].books++;
    months[f.month!].pages += f.pages;
  }
  const busiest = months.reduce((best, m, month) => (m.books > (best?.books ?? 0) || (m.books === best?.books && m.books > 0 && m.pages > best.pages) ? { ...m, month } : best), null as WrappedData["busiestMonth"]);

  // Highest rating this year; a tie goes to the one finished later, since it's fresher in mind.
  const topRated = completed.reduce<Finish | null>((best, f) => (f.rating && f.rating > 0 && f.rating >= (best?.rating ?? 0) ? f : best), null);

  const medals: WrappedMedal[] = [];
  for (const e of earned) {
    const day = localDay(e.earnedAt, timeZone);
    if (Number(day.slice(0, 4)) !== year || (month !== null && Number(day.slice(5, 7)) - 1 !== month)) continue;
    const found = getMilestone(e.key);
    if (found) medals.push({ key: e.key, achievementKey: found.achievement.key, title: found.milestone.title, achievement: found.achievement.title, earnedAt: e.earnedAt.toISOString() });
  }

  // This year, the same count as the profile frame. For a past year, the books first finished by its
  // end, plus books finished on undated past reads (shelved as already read, so before then).
  let tierBooks = completedBooks;
  if (year < currentYear) {
    const firstYear = new Map<string, number | null>();
    for (const f of finishes) {
      if (f.outcome !== "COMPLETED") continue;
      const prev = firstYear.get(f.book.id);
      // An undated read counts as the earliest: it was shelved as already read.
      if (prev === undefined || (prev !== null && (f.year === null || f.year < prev))) firstYear.set(f.book.id, f.year);
    }
    tierBooks = Array.from(firstYear.values()).filter((y) => y === null || y <= year).length;
  }
  const tier = getReaderTier(tierBooks);

  const yearGoal = goals.find((g) => g.year === year);
  const target = month === null ? yearGoal?.targetBooks : yearGoal?.targetBooksPerMonth;
  const perBook = new Map<string, number>();
  for (const f of completed) perBook.set(f.book.id, (perBook.get(f.book.id) ?? 0) + 1);

  return {
    year,
    month,
    isCurrentYear: year === currentYear,
    books: completed.length,
    distinctBooks: finished.length,
    pages: completed.reduce((sum, f) => sum + f.pages, 0),
    minutes: completed.reduce((sum, f) => sum + f.minutes, 0),
    rereads: Array.from(perBook.values()).reduce((sum, n) => sum + n - 1, 0),
    dnf: inYear.length - completed.length,
    topGenre: tally(finished.map((b) => b.genre), 1)[0] ?? null,
    topAuthor: tally(finished.map((b) => b.author), 1)[0] ?? null,
    topRated: topRated ? { ...topRated.book, rating: topRated.rating! } : null,
    longestBook: longest(finished),
    firstBook: completed[0]?.book ?? null,
    lastBook: completed.length > 1 ? completed[completed.length - 1].book : null,
    busiestMonth: busiest,
    months,
    medals,
    tier: tier && { key: tier.key, label: tier.label, light: tier.light, colour: tier.colour, shade: tier.shade },
    tierBooks,
    goal: target ? { target, completed: completed.length, met: completed.length >= target } : null,
  };
}

// ---- Wrap cards ------------------------------------------------------------------------------

// What a cover grid or stats card draws for a year, or with `month` (0 to 11) one month of it
// (packages/shared/src/wrapCards.ts). A card is made to be posted, so private books are always left
// out, even for the reader. Each book appears once, in the order first finished, with the rating of
// its latest read and the reader's own spice and moods for it.
export async function getWrapCard(userId: string, year: number, month: number | null = null): Promise<WrapCardData> {
  const data = await readingData(userId, true);
  const { currentYear, currentMonth } = data;
  const card = await wrapCardOf(userId, data, (f) => f.year === year && (month === null || f.month === month));
  return { ...card, year, month, isCurrent: year === currentYear && (month === null || month === currentMonth) };
}

// The same card for any range of days (the stats explorer, Plus): `range` carries its words.
export async function getRangeWrapCard(userId: string, range: DateRange): Promise<WrapCardData> {
  const data = await readingData(userId, true);
  const card = await wrapCardOf(userId, data, (f) => f.day !== null && f.day >= range.from && f.day <= range.to);
  const today = localDay(new Date(), data.timeZone);
  return { ...card, year: Number(range.from.slice(0, 4)), month: null, isCurrent: range.to >= today, range };
}

async function wrapCardOf(userId: string, data: Awaited<ReturnType<typeof readingData>>, inPeriod: (f: Finish) => boolean): Promise<Omit<WrapCardData, "year" | "month" | "isCurrent">> {
  const { finishes, books } = data;
  const completed = finishes
    .filter((f) => f.outcome === "COMPLETED" && inPeriod(f))
    .sort((a, b) => a.at!.getTime() - b.at!.getTime());

  const rated = new Map<string, number | null>();
  for (const f of completed) rated.set(f.book.id, f.rating && f.rating > 0 ? f.rating : rated.get(f.book.id) ?? null);
  const finished = distinctBooks(completed);

  const workOf = new Map(books.map((b) => [b.id, b.workId]));
  const workIds = Array.from(new Set(finished.map((b) => workOf.get(b.id)).filter((id): id is string => !!id)));
  const tags = workIds.length
    ? await prisma.readerTags.findMany({ where: { userId, workId: { in: workIds } }, select: { workId: true, moods: true, spice: true } })
    : [];
  const tagsByWork = new Map(tags.map((t) => [t.workId, t]));

  const moods: Partial<Record<Mood, number>> = {};
  for (const b of finished) {
    const own = tagsByWork.get(workOf.get(b.id) ?? "");
    for (const m of own?.moods ?? []) moods[m] = (moods[m] ?? 0) + 1;
  }

  // Whole stars, rounded down: a 4¾ counts with the fours.
  const ratings = [0, 0, 0, 0, 0];
  for (const r of rated.values()) if (r) ratings[Math.min(5, Math.max(1, Math.floor(r))) - 1]++;
  const ratingValues = Array.from(rated.values()).filter((r): r is number => !!r);

  return {
    books: finished.map((b) => {
      const own = tagsByWork.get(workOf.get(b.id) ?? "");
      return { id: b.id, title: b.title, author: b.author, coverImage: b.coverImage, cardColour: b.cardColour, rating: rated.get(b.id) ?? null, spice: own?.spice ?? null };
    }),
    finishes: completed.length,
    pages: completed.reduce((sum, f) => sum + f.pages, 0),
    minutes: completed.reduce((sum, f) => sum + f.minutes, 0),
    ratings,
    averageRating: ratingValues.length ? Math.round((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) * 100) / 100 : null,
    genres: tally(finished.map((b) => b.genre), 3),
    moods,
  };
}

// The years and months a Wrap card has books for (packages/shared/src/wrapCards.ts cardPeriodKeys): shared
// finishes only, as getWrapCard draws them, so a year of only private books isn't offered.
export async function getCardPeriods(userId: string): Promise<string[]> {
  const { finishes } = await readingData(userId, true);
  return cardPeriodKeys(finishes.flatMap((f) => (f.outcome === "COMPLETED" && f.year !== null && f.month !== null ? [{ year: f.year, month: f.month + 1 }] : [])));
}

// ---- The stats explorer (Plus) ---------------------------------------------------------------

// Every read that ended, as the stats explorer counts it (packages/shared/src/statsExplorer.ts), with the
// reader's own moods and spice for each work. The reader's own view, so private books are in. The route
// checks statsExplorer first; the stats themselves are the same finishes /stats counts.
export async function explorerFinishes(userId: string): Promise<{ finishes: ExplorerFinish[]; today: string; timeZone: string }> {
  const { finishes, books, timeZone } = await readingData(userId);
  const workOf = new Map(books.map((b) => [b.id, b.workId]));
  const tags = await prisma.readerTags.findMany({ where: { userId }, select: { workId: true, moods: true, spice: true } });
  const tagsByWork = new Map(tags.map((t) => [t.workId, t]));

  // A re-read is any completed read after the book's first: dated reads in order, undated ones first, as
  // history shelved as already read comes before anything dated.
  const ordered = finishes
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (a.f.at?.getTime() ?? -Infinity) - (b.f.at?.getTime() ?? -Infinity) || a.i - b.i);
  const seen = new Set<string>();
  const reread = new Set<number>();
  for (const { f, i } of ordered) {
    if (f.outcome !== "COMPLETED") continue;
    if (seen.has(f.book.id)) reread.add(i);
    seen.add(f.book.id);
  }

  return {
    timeZone,
    today: localDay(new Date(), timeZone),
    finishes: finishes.map((f, i) => {
      const own = tagsByWork.get(workOf.get(f.book.id) ?? "");
      return {
        bookId: f.book.id,
        title: f.book.title,
        author: f.book.author,
        genre: f.book.genre,
        format: f.format,
        outcome: f.outcome,
        day: f.day,
        pages: f.pages,
        minutes: f.minutes,
        rating: f.rating,
        moods: own?.moods ?? [],
        spice: own?.spice ?? null,
        reread: reread.has(i),
      };
    }),
  };
}

// The year and month (0 to 11) a monthly card URL names, if that month has started: 2000 up to now.
export function parseWrappedMonth(rawYear: string, rawMonth: string, now = new Date()): { year: number; month: number } | null {
  const year = parseWrappedYear(rawYear, now);
  if (!year || !/^\d{1,2}$/.test(rawMonth)) return null;
  const month = Number(rawMonth) - 1;
  if (month < 0 || month > 11) return null;
  // UTC+14 reaches a new month first, same as parseWrappedYear.
  const ahead = new Date(now.getTime() + 14 * 3600_000);
  if (year === ahead.getUTCFullYear() && month > ahead.getUTCMonth()) return null;
  return { year, month };
}

// Years worth a Wrapped: any with a dated finish, and this one. Newest first.
export async function getWrappedYears(userId: string, { sharedOnly = false } = {}): Promise<number[]> {
  const { finishes, currentYear } = await readingData(userId, sharedOnly);
  const years = new Set<number>([currentYear]);
  for (const f of finishes) if (f.outcome === "COMPLETED" && f.year !== null) years.add(f.year);
  return Array.from(years).sort((a, b) => b - a);
}

// The year a Wrapped URL names, if it's one we can show: 2000 up to this year.
export function parseWrappedYear(raw: string, now = new Date()): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  // The latest year anyone is in yet: UTC+14 reaches New Year first.
  const latest = new Date(now.getTime() + 14 * 3600_000).getUTCFullYear();
  return year >= 2000 && year <= latest ? year : null;
}

// Whether a signed-out visitor may see this reader's Wrapped (metadata and share images, which
// crawlers fetch). Wrapped is public exactly when the profile is. The page itself also lets in
// signed-in viewers the profile settings allow, via canViewUser.
export function isWrappedPublic(owner: { id: string }): Promise<boolean> {
  return isProfilePublic(owner.id);
}

// The reader a /u/<username>/wrapped URL names. Callers still check isWrappedPublic (the owner can
// always see their own). Shared by the page, its metadata and its images within one request.
export const getWrappedOwner = cache(async (username: string) => {
  if (!username) return null;
  const user = await findUserByUsername(username, { id: true, username: true, displayName: true, favColour: true, image: true });
  if (!user?.username) return null;
  return { ...user, username: user.username };
});

// The year /wrapped opens on: this year once the season starts, otherwise last year's.
export function defaultWrappedYear(now = new Date()): number {
  return isWrappedSeason(now) ? now.getFullYear() : now.getFullYear() - 1;
}

// The Wrapped links under the stats: past years with books always have one, this year's opens in
// December. Newest first, at most four.
export function wrappedYearsFor(stats: ReadingStats, now = new Date()): number[] {
  const thisYear = stats.years[stats.years.length - 1]?.year ?? now.getFullYear();
  return stats.years
    .filter((y) => y.books > 0 && (y.year < thisYear || isWrappedSeason(now)))
    .map((y) => y.year)
    .reverse()
    .slice(0, 4);
}
