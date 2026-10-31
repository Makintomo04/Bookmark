// The shapes of reading stats and Wrapped, shared by the web (lib/stats.ts builds them) and the mobile
// app (which reads them from /api/stats and /api/wrapped/<year>).
import type { Mood } from "./workTags";

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  pages: number;
  // Set for an audiobook listened on minutes: its running time.
  audioMinutes: number | null;
  coverImage: string;
  cardColour: string | null;
  genre: string | null;
}

export interface Tally {
  name: string;
  count: number;
}

export interface PeriodCount {
  books: number;
  pages: number;
}

export interface GoalResult {
  year: number;
  target: number;
  completed: number;
  met: boolean;
  // Plus goals (lib/goals.ts). Null when not set; the pages and months are counted either way.
  targetPages: number | null;
  pages: number;
  targetBooksPerMonth: number | null;
  // Books a month: the custom target when set, otherwise the yearly goal over twelve months. Free.
  pacePerMonth: number;
  paceIsCustom: boolean;
  // Months of the year (so far, for this year) that reached the monthly pace.
  monthsMet: number;
  monthsCounted: number;
}

export interface ReadingStats {
  timeZone: string;
  booksRead: number; // distinct books finished at least once
  finishes: number; // completed reads, re-reads included
  pagesRead: number; // pages across every finish
  minutesListened: number; // audiobook running time across every finish of one
  undatedFinishes: number;
  rereads: number; // finishes beyond each book's first
  rereadBooks: number;
  dnf: number;
  // DNF reads out of every read that ended (finished or abandoned). Null before any ended.
  dnfRate: number | null;
  averagePages: number | null;
  longestBook: BookSummary | null;
  ratedBooks: number;
  averageRating: number | null;
  // 0.5 to 5, every half star, including empty buckets. A quarter counts with the half below it.
  ratings: { rating: number; count: number }[];
  genres: Tally[];
  authors: Tally[];
  // Every year from the first dated finish to this year, oldest first.
  years: (PeriodCount & { year: number })[];
  // Per year in `years`, twelve months.
  months: Record<number, PeriodCount[]>;
  goals: GoalResult[]; // newest first
  streak: number;
  // Books finished, by the decade they were first published (catalogue's first publish year), oldest first.
  // Books with no known year are left out.
  decades: { decade: number; count: number }[];
  // Books finished, by length: page buckets for books read, hour buckets for audiobooks listened to.
  lengths: { label: string; min: number; count: number }[];
  listenLengths: { label: string; min: number; count: number }[];
  // Finished reads with both a start and a finish date: the average, quickest and slowest, in days.
  daysToFinish: { reads: number; average: number; fastest: { book: BookSummary; days: number }; slowest: { book: BookSummary; days: number } } | null;
  // The book finished most often, when one was finished more than once.
  mostReread: { book: BookSummary; times: number } | null;
}

export interface WrappedMedal {
  key: string; // the stored milestone, e.g. "BOOKS_READ:25"
  achievementKey: string; // its ladder, e.g. "BOOKS_READ" (what <Medal> draws)
  title: string;
  achievement: string;
  earnedAt: string;
}

export interface WrappedData {
  year: number;
  // Set for a monthly Wrap card (0 to 11): every count below is for that month alone.
  month: number | null;
  isCurrentYear: boolean;
  books: number; // finishes in the year, re-reads included
  distinctBooks: number;
  pages: number;
  // Listened to on finished audiobooks.
  minutes: number;
  rereads: number;
  dnf: number;
  topGenre: Tally | null;
  topAuthor: Tally | null;
  topRated: (BookSummary & { rating: number }) | null;
  longestBook: BookSummary | null;
  firstBook: BookSummary | null;
  lastBook: BookSummary | null;
  busiestMonth: (PeriodCount & { month: number }) | null;
  months: PeriodCount[];
  medals: WrappedMedal[];
  tier: { key: string; label: string; light: string; colour: string; shade: string } | null;
  // Books counted for the tier at the end of the year.
  tierBooks: number;
  // The yearly book goal; for a month, the monthly pace if one is set.
  goal: { target: number; completed: number; met: boolean } | null;
}

// A cover grid or stats card (packages/shared/src/wrapCards.ts, lib/stats.ts getWrapCard). Private
// books are never in it.
export interface WrapCardBook {
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  cardColour: string | null;
  // The latest read's rating, if it had one.
  rating: number | null;
  // The reader's own spice for it (0 to 5), only ever asked about romance.
  spice: number | null;
}

export interface WrapCardData {
  year: number;
  // 0 to 11, or null for the whole year.
  month: number | null;
  // The period isn't over yet ("My 2026 so far").
  isCurrent: boolean;
  // A custom range (the stats explorer, Plus) instead of the year or month above: the card's words come from it.
  range?: { from: string; to: string };
  // Each book once, in the order first finished.
  books: WrapCardBook[];
  // Reads finished, re-reads included; pages and minutes count every one.
  finishes: number;
  pages: number;
  minutes: number;
  // Rated books by whole star, one to five.
  ratings: number[];
  averageRating: number | null;
  genres: Tally[];
  // How many of these books the reader tagged with each mood.
  moods: Partial<Record<Mood, number>>;
}
