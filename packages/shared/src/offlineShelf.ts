import type { ProgressBook } from "./progress";

// Offline shelves (BOO-105). The app keeps a saved copy of the reader's shelves on the phone, and progress
// logged without a connection waits there until it can be sent. These are the rules both ends share:
// how waiting updates combine, how one shows on the book before it's sent, how much of the saved copy is
// kept, and how the server dates an update that arrives late. Pure, so scripts/test/offlineShelf.test.ts
// runs them.

// A place logged while offline, waiting to go to POST /api/book-progress with action "progress".
export interface QueuedProgress {
  bookId: string;
  // The place as the book page sends it: currentPage, currentMinute or currentPercent, and logsPercent.
  place: Record<string, unknown>;
  // When the reader logged it (ISO), sent as loggedAt so the server counts the day they actually read.
  loggedAt: string;
}

// One waiting update per book: a newer place replaces an older one, since a place is absolute (page 140,
// not "20 more pages"). Order is kept by when each book was last logged, oldest first.
export function queueProgress(queue: QueuedProgress[], next: QueuedProgress): QueuedProgress[] {
  return [...queue.filter((q) => q.bookId !== next.bookId), next];
}

// The fields a progress save can move, as the server stores them: a percent wins and clears nothing else;
// a page or minute clears the percent. Only for showing the book until the save is sent; the server's
// answer replaces it.
type Place = Pick<ProgressBook, "currentPage" | "currentMinute" | "currentPercent" | "logsPercent">;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function withQueuedPlace<T extends Partial<Place>>(book: T, place: Record<string, unknown>): T {
  const percent = num(place.currentPercent);
  const page = num(place.currentPage);
  const minute = num(place.currentMinute);
  const next: T = { ...book };
  if (percent !== undefined) next.currentPercent = percent;
  else if (page !== undefined) Object.assign(next, { currentPage: page, currentPercent: null });
  else if (minute !== undefined) Object.assign(next, { currentMinute: minute, currentPercent: null });
  if (typeof place.logsPercent === "boolean") next.logsPercent = place.logsPercent;
  return next;
}

// The saved copy: each entry is one API answer the app showed, with when it was saved.
export interface SavedEntry { data: unknown; savedAt: number }

// What's kept: who's signed in, the Library, this year's goal, and the first page of a shelf as it opens, a
// shelf and a sort with no search or filter (facets=1 marks a first page). Book pages and their reads are
// kept too, the most recently opened MAX_SAVED_BOOKS of them, so the copy stays small on a reader with
// thousands of books.
export const MAX_SAVED_BOOKS = 100;
const BOOK_KEY = /^\/api\/books\/[^/?]+(\/reads)?$/;
const PLAIN_SHELF_PARAMS = new Set(["shelf", "sort", "take", "facets"]);

export function isSavedKey(key: string): boolean {
  if (key === "/api/user") return true;
  if (key.startsWith("/api/books?shelves=")) return true;
  if (key.startsWith("/api/reading-goal/summary")) return true;
  if (key.startsWith("/api/books?")) {
    // Read by hand: React Native's URLSearchParams can't parse a query.
    const names = key.slice("/api/books?".length).split("&").map((pair) => pair.split("=")[0]);
    return names.includes("facets") && names.every((name) => PLAIN_SHELF_PARAMS.has(name));
  }
  return BOOK_KEY.test(key);
}

export function pruneSaved(entries: Record<string, SavedEntry>, maxBooks = MAX_SAVED_BOOKS): Record<string, SavedEntry> {
  const kept: Record<string, SavedEntry> = {};
  const books: [string, SavedEntry][] = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (!isSavedKey(key)) continue;
    if (BOOK_KEY.test(key)) books.push([key, entry]);
    else kept[key] = entry;
  }
  // A book's page and its reads count as one book.
  const bookOf = (key: string) => key.replace(/\/reads$/, "");
  const newest = new Map<string, number>();
  for (const [key, entry] of books) newest.set(bookOf(key), Math.max(newest.get(bookOf(key)) ?? 0, entry.savedAt));
  const keep = new Set([...newest.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxBooks).map(([book]) => book));
  for (const [key, entry] of books) if (keep.has(bookOf(key))) kept[key] = entry;
  return kept;
}

// ---- Server side -----------------------------------------------------------------------------------

// How far back a late update still counts for its own day. Older than this, the place is saved but no
// reading day is added: a week-old phone shouldn't rewrite last month's streak.
export const LOGGED_AT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// When a progress save happened: the phone's loggedAt when it's believable, otherwise now. A time ahead of
// the server's (a phone clock running fast) is now. readingDay says whether the save adds a reading day.
export function progressMoment(loggedAt: Date | undefined, now: Date): { at: Date; readingDay: boolean } {
  if (!loggedAt || Number.isNaN(loggedAt.getTime()) || loggedAt.getTime() > now.getTime()) return { at: now, readingDay: true };
  if (now.getTime() - loggedAt.getTime() > LOGGED_AT_MAX_AGE_MS) return { at: now, readingDay: false };
  return { at: loggedAt, readingDay: true };
}

// A late update older than the book's last progress (logged since on the web or another phone) would move
// the reader backwards, so it's skipped.
export function isStaleProgress(loggedAt: Date | undefined, lastProgressAt: Date | null | undefined): boolean {
  return !!loggedAt && !!lastProgressAt && loggedAt.getTime() < lastProgressAt.getTime();
}
