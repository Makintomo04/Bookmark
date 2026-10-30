// Rating-spike checks, apart from the database so scripts/test/ratingSpikes.test.ts runs under plain Node.
// lib/ratingSpikes.ts finds the rows and does the work.
//
// A spike is a burst on one book: several extreme ratings, all the same way, from accounts that were days
// old when they rated, making up most of the ratings the book got that week. Readers who rate a book they
// loved on their first day don't trip it; five brand-new accounts all giving one star in a week do.

export const SPIKE_WINDOW_DAYS = 7;
// An account this young (at the time of the rating) counts as new.
export const NEW_ACCOUNT_DAYS = 14;
// New-account ratings, the same way, needed to flag a book.
export const SPIKE_MIN_RATINGS = 5;
// And they must be at least this share of the book's ratings in the window, so a well-known book that
// happens to get five new readers' praise among hundreds of others isn't flagged.
export const SPIKE_MIN_SHARE = 0.5;
export const LOW_RATING_MAX = 1.5;
export const HIGH_RATING_MIN = 4.5;

const DAY = 24 * 60 * 60 * 1000;

export interface RatingRow {
  bookId: string;
  userId: string;
  rating: number;
  ratedAt: Date;
  accountCreatedAt: Date;
}

export type SpikeSide = "low" | "high";

export interface Spike {
  side: SpikeSide;
  // The flagged ratings: one per reader, new accounts only.
  bookIds: string[];
  count: number;
  // Every rating the book got in the window, flagged or not.
  windowTotal: number;
  firstAt: Date;
  lastAt: Date;
}

export const sideOf = (rating: number): SpikeSide | null =>
  rating <= LOW_RATING_MAX ? "low" : rating >= HIGH_RATING_MIN ? "high" : null;

// `rows` are one book's ratings (any account age). `reviewedAt` is when staff last looked at it: only
// ratings after it count, so a dismissed book isn't flagged again for the same burst.
export function findSpike(rows: RatingRow[], now: Date, reviewedAt?: Date | null): Spike | null {
  const since = now.getTime() - SPIKE_WINDOW_DAYS * DAY;
  const inWindow = rows.filter((r) => r.rating > 0 && r.ratedAt.getTime() >= since && (!reviewedAt || r.ratedAt > reviewedAt));
  const windowTotal = new Set(inWindow.map((r) => r.userId)).size;
  if (windowTotal === 0) return null;

  const fresh = inWindow.filter((r) => r.ratedAt.getTime() - r.accountCreatedAt.getTime() <= NEW_ACCOUNT_DAYS * DAY);
  const bySide: Record<SpikeSide, RatingRow[]> = { low: [], high: [] };
  const seen = new Set<string>();
  for (const r of fresh) {
    const side = sideOf(r.rating);
    if (!side || seen.has(r.userId)) continue;
    seen.add(r.userId);
    bySide[side].push(r);
  }
  const side: SpikeSide = bySide.low.length >= bySide.high.length ? "low" : "high";
  const flagged = bySide[side];
  if (flagged.length < SPIKE_MIN_RATINGS || flagged.length / windowTotal < SPIKE_MIN_SHARE) return null;
  const times = flagged.map((r) => r.ratedAt.getTime());
  return {
    side, bookIds: flagged.map((r) => r.bookId), count: flagged.length, windowTotal,
    firstAt: new Date(Math.min(...times)), lastAt: new Date(Math.max(...times)),
  };
}

export const SPIKE_ACTIONS = ["dismiss", "hold", "release"] as const;
export type SpikeAction = (typeof SPIKE_ACTIONS)[number];
export const isSpikeAction = (value: unknown): value is SpikeAction => typeof value === "string" && (SPIKE_ACTIONS as readonly string[]).includes(value);
