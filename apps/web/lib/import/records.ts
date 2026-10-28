import type { Status } from "@prisma/client";
import { newObjectId } from "../objectId.ts";
import { sameBook } from "../workKey.ts";
import { SOURCE_LABEL, type ImportMatch, type ImportRow, type ImportSource } from "./types.ts";

// Turns a mapped row (plus its Open Library match) into the Book, BookRead and Note rows to insert.
// Pure, so scripts/test/import.test.ts checks it without a database. Kept free of "@/" imports.

// Matches the API's limit (app/api/book-progress), so an imported review can still be edited and re-saved.
export const REVIEW_MAX = 2000;

// Ids are chosen when the job is created so a retried batch finds the books it already inserted instead
// of inserting them twice.
export { newObjectId };

export interface BookInsert {
  id: string;
  userId: string;
  title: string;
  author: string;
  coverImage: string;
  status: Status;
  genre: string | null;
  tags: string[];
  rating: number | null;
  review: string | null;
  timesRead: number;
  pages: number;
  currentPage: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  stoppedAt: Date | null;
  workKey: string | null;
  // The shared catalog row the book was filed under, when the import step resolved one.
  workId: string | null;
  editionId: string | null;
}

export interface ReadInsert {
  bookId: string;
  userId: string;
  status: Status;
  startedAt: Date | null;
  finishedAt: Date | null;
  rating: number | null;
  stoppedAtPage: number | null;
  createdAt: Date;
}

export interface NoteInsert {
  bookId: string;
  title: string;
  content: string;
}

const date = (iso: string | null | undefined) => (iso ? new Date(iso) : null);

const SECOND = 1000;

// Reads are listed in createdAt order. Dated reads use their own date; undated ones sit a second apart
// just before the first dated read (or the date the book was added), so the history reads oldest first.
function orderedCreatedAt(dates: (Date | null)[], anchor: Date): Date[] {
  const firstDated = dates.find((d): d is Date => !!d);
  let cursor = new Date((firstDated ?? anchor).getTime() - dates.length * SECOND);
  return dates.map((d) => {
    const next = d && d.getTime() > cursor.getTime() ? d : new Date(cursor.getTime() + SECOND);
    cursor = next;
    return next;
  });
}

export function buildRecords(
  row: ImportRow,
  match: ImportMatch | null,
  ctx: { userId: string; bookId: string; now: Date; source: ImportSource; catalog?: { workId: string; editionId: string } | null }
): { book: BookInsert; reads: ReadInsert[]; notes: NoteInsert[] } {
  const { userId, bookId, now, source } = ctx;
  const status = row.status;
  const pages = row.pages ?? match?.pages ?? 0;
  const isStopped = status === "DNF" || status === "PAUSED";
  // Left empty when the export has no date: stamping the import date would count the book as put
  // down this year in stats and Wrapped.
  const stoppedAt = isStopped ? date(row.stoppedAt) : null;
  const timesRead = row.completedReads.length;

  const currentPage =
    row.currentPage !== null ? row.currentPage
    : status === "COMPLETED" ? pages
    : 0;

  let review = row.review;
  const notes: NoteInsert[] = [];
  if (review && review.length > REVIEW_MAX) {
    // Keep every word: the full review becomes a note, and the shelf shows the first 2,000 characters.
    notes.push({ bookId, title: `Full review (imported from ${SOURCE_LABEL[source]})`, content: review });
    review = review.slice(0, REVIEW_MAX - 1).trimEnd() + "…";
  }
  if (row.privateNotes) notes.push({ bookId, title: `Private notes (imported from ${SOURCE_LABEL[source]})`, content: row.privateNotes });

  const book: BookInsert = {
    id: bookId,
    userId,
    title: row.title,
    author: row.author,
    coverImage: row.coverUrl ?? match?.coverUrl ?? "",
    status,
    genre: row.genre ?? match?.genre ?? null,
    tags: row.tags ?? [],
    rating: row.rating,
    review,
    timesRead,
    pages,
    currentPage,
    createdAt: date(row.addedAt) ?? now,
    startedAt: date(row.startedAt),
    // Undated finishes stay undated so they never count toward this year's goal (see /api/books).
    completedAt: date(row.completedAt),
    stoppedAt,
    workKey: row.workKey ?? match?.workKey ?? null,
    workId: ctx.catalog?.workId ?? null,
    editionId: ctx.catalog?.editionId ?? null,
  };

  // Finished reads, then the current one (open, or the DNF). Book.status mirrors the last read.
  type Draft = Omit<ReadInsert, "createdAt" | "bookId" | "userId">;
  const drafts: Draft[] = row.completedReads.map((r) => ({
    status: "COMPLETED",
    startedAt: date(r.startedAt),
    finishedAt: date(r.finishedAt),
    rating: null,
    stoppedAtPage: null,
  }));
  if (status === "STARTED" || status === "PAUSED") {
    drafts.push({ status, startedAt: date(row.startedAt), finishedAt: null, rating: null, stoppedAtPage: null });
  } else if (status === "DNF") {
    drafts.push({ status, startedAt: date(row.startedAt), finishedAt: stoppedAt, rating: null, stoppedAtPage: currentPage });
  }
  // The rating belongs to the latest closed read (a finish or a DNF), as the progress route records it.
  const lastClosed = [...drafts].reverse().find((d) => d.status === "COMPLETED" || d.status === "DNF");
  if (lastClosed && (status === "COMPLETED" || status === "DNF")) lastClosed.rating = row.rating;

  const created = orderedCreatedAt(drafts.map((d) => d.finishedAt ?? d.startedAt), book.createdAt);
  const reads = drafts.map((d, i) => ({ ...d, bookId, userId, createdAt: created[i] }));

  return { book, reads, notes };
}


// ---- De-duplication ----------------------------------------------------------------------

export type ShelfBook = { workKey?: string | null; title: string; author: string };

// The row as it will land on the shelf, for sameBook().
export const shelfKey = (row: ImportRow, match: ImportMatch | null): ShelfBook => ({
  workKey: row.workKey ?? match?.workKey ?? null,
  title: row.title,
  author: row.author,
});

// Same normalisation as lib/workKey.ts, only used to bucket candidates before calling sameBook().
const bucket = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// A shelf indexed by work key and by title, so checking 2,000 rows against 2,000 books stays cheap.
// sameBook() still makes every decision; the index only narrows down which books it compares.
export class ShelfIndex {
  private byKey = new Map<string, ShelfBook[]>();
  private byTitle = new Map<string, ShelfBook[]>();

  constructor(books: ShelfBook[] = []) {
    books.forEach((b) => this.add(b));
  }

  add(book: ShelfBook) {
    const push = (map: Map<string, ShelfBook[]>, k: string) => {
      const list = map.get(k);
      if (list) list.push(book);
      else map.set(k, [book]);
    };
    if (book.workKey) push(this.byKey, book.workKey);
    push(this.byTitle, bucket(book.title));
  }

  has(book: ShelfBook) {
    const byKey = book.workKey ? this.byKey.get(book.workKey) ?? [] : [];
    const byTitle = this.byTitle.get(bucket(book.title)) ?? [];
    return byKey.some((b) => sameBook(b, book)) || byTitle.some((b) => sameBook(b, book));
  }
}

// Each row's duplicate: "shelf" (already on the reader's shelf), "file" (an earlier row in the same
// file), or null. Uses the app's sameBook rule: work key when both have one, else title + author.
export function findDuplicates(
  rows: ImportRow[],
  matches: (ImportMatch | null | undefined)[],
  shelf: ShelfBook[]
): ("shelf" | "file" | null)[] {
  const onShelf = new ShelfIndex(shelf);
  const seen = new ShelfIndex();
  return rows.map((row, i) => {
    const key = shelfKey(row, matches[i] ?? null);
    if (onShelf.has(key)) return "shelf";
    if (seen.has(key)) return "file";
    seen.add(key);
    return null;
  });
}
