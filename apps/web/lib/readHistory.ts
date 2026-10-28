import { z } from "zod";
import type { Book, Status } from "@prisma/client";

// Kept free of "@/" imports so scripts/backfill-reads.ts can load it with plain Node.

// Quarter-star ratings: 0.25, 0.5, 0.75 … 5. Quarters are exact in floating point, so multipleOf is safe.
export const ratingSchema = z.number().min(0.25).max(5).multipleOf(0.25);
// What the API accepts: a rating, or null/0 to clear it.
export const ratingInputSchema = z.union([ratingSchema, z.literal(0), z.null()]).transform((n) => n || null);
export const RATING_ERROR = "Rating must be from 0.25 to 5 stars, in quarter-star steps";

// A read is open while it can still be picked back up.
export const OPEN_READ_STATUSES = ["STARTED", "PAUSED"] as const satisfies readonly Status[];
// Statuses whose book has at least one read. NOT_STARTED books may still have closed DNF reads.
export const READ_STATUSES = ["STARTED", "PAUSED", "COMPLETED", "DNF"] as const satisfies readonly Status[];

type BookForRead = Pick<Book, "id" | "userId" | "status" | "startedAt" | "completedAt" | "stoppedAt" | "rating" | "currentPage" | "pages"
  | "progressUnit" | "audioMinutes" | "currentMinute"> & Partial<Pick<Book, "currentPercent">>;

// The single read implied by a book's own fields. Used when a book is created, by the backfill for books
// shelved before BookRead existed, and as a fallback when a book has no open read to update.
// Returns null for NOT_STARTED, which has no read.
export function readFromBook(book: BookForRead) {
  if (book.status === "NOT_STARTED") return null;
  return {
    bookId: book.id,
    userId: book.userId,
    status: book.status,
    startedAt: book.startedAt,
    finishedAt: book.status === "COMPLETED" ? book.completedAt : book.status === "DNF" ? book.stoppedAt : null,
    rating: book.status === "COMPLETED" || book.status === "DNF" ? book.rating : null,
    stoppedAtPage: book.status === "DNF" ? book.currentPage ?? 0 : null,
    // Audiobooks: the read carries the scale it was listened on.
    progressUnit: book.progressUnit ?? null,
    audioMinutes: book.progressUnit === "MINUTES" ? book.audioMinutes ?? null : null,
    currentMinute: book.progressUnit === "MINUTES" ? book.currentMinute ?? 0 : null,
    stoppedAtMinute: book.status === "DNF" && book.progressUnit === "MINUTES" ? book.currentMinute ?? 0 : null,
    // A percent logged by a Kindle reader (Book.currentPercent); a finished read is 100% whatever it says.
    currentPercent: book.status === "COMPLETED" ? null : book.currentPercent ?? null,
    // An ended read keeps its length (lib/progress.ts readLength); an open one follows the book.
    pages: book.status === "COMPLETED" || book.status === "DNF" ? book.pages : null,
  };
}

// The shelves a book can be re-filed onto when the reader put it on the wrong one.
export const RESHELVE_TARGETS = ["NOT_STARTED", "STARTED", "COMPLETED", "DNF"] as const satisfies readonly Status[];
export type ReshelveTarget = typeof RESHELVE_TARGETS[number];

type BookForReshelve = Pick<Book, "status" | "pages" | "completedAt" | "timesRead" | "progressUnit" | "audioMinutes" | "currentMinute">;

// A book on the wrong shelf, filed as if it had been added to the right one (as POST /api/books files
// it). The caller removes the read the wrong shelf made; `earlierRating` is the rating of the latest
// read left after that, so a past read's rating survives a mistaken re-read being undone.
export function reshelvedFields(
  book: BookForReshelve,
  to: ReshelveTarget,
  { now, finishedThisYear, finishedAt, startedAt, rating, earlierRating }: {
    now: Date; finishedThisYear: boolean; rating: number | null | undefined; earlierRating: number | null;
    // Picked dates for a move to Finished (null: "I don't remember"). Left out, finishedThisYear decides.
    finishedAt?: Date | null; startedAt?: Date | null;
  },
) {
  const finished = to === "COMPLETED";
  const ended = finished || to === "DNF";
  const runningTime = book.progressUnit === "MINUTES" ? book.audioMinutes : null;
  return {
    status: to,
    // As when adding: Reading starts today, and a finished read takes the dates picked for it.
    startedAt: to === "STARTED" ? now : finished ? startedAt ?? null : null,
    stoppedAt: to === "DNF" ? now : null,
    completedAt: finished ? (finishedAt !== undefined ? finishedAt : finishedThisYear ? now : null) : book.completedAt,
    currentPage: finished ? book.pages : 0,
    currentMinute: runningTime ? (finished ? runningTime : 0) : book.currentMinute,
    // The place starts again from the beginning (or the end), so a percent logged before goes.
    currentPercent: null,
    timesRead: Math.max(0, book.timesRead + (finished ? 1 : 0) - (book.status === "COMPLETED" ? 1 : 0)),
    rating: ended && rating !== undefined ? rating : earlierRating,
  };
}

// ---- Dates the reader picks ------------------------------------------------------------------------

// A day from a date picker ("2024-03-01"), stored at noon UTC so it lands on that day in every time zone
// stats and Wrapped count in (lib/timeZone.ts localDay). Not before 1900, and not after tomorrow (a reader
// ahead of UTC can already be on it).
export const dayInputSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2024-03-01")
  .transform((s) => new Date(`${s}T12:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1900, "That date isn't valid")
  .refine((d) => d.getTime() <= Date.now() + 36 * 3600_000, "That date is in the future");
// A day, or null for "I don't remember".
export const optionalDaySchema = dayInputSchema.nullable();

// The day a stored date falls on, for a date picker's value.
export const dayOf = (date: Date | string | null | undefined) => (date ? new Date(date).toISOString().slice(0, 10) : "");

// ---- Keeping Book in step with its reads ---------------------------------------------------------------

type ReadForBook = { status: Status; startedAt: Date | null; finishedAt: Date | null; rating: number | null };

// A book's reads in the order they happened: by start (or finish) date, undated ones first, an open read
// always last. Edits keep BookRead.createdAt in this order too (readCreatedAt), so code that takes "the
// latest read" by createdAt agrees.
export function readOrder<T extends ReadForBook & { createdAt: Date }>(reads: T[]): T[] {
  const open = (r: T) => (OPEN_READ_STATUSES as readonly Status[]).includes(r.status);
  const when = (r: T) => (r.startedAt ?? r.finishedAt)?.getTime() ?? -Infinity;
  return reads.slice().sort((a, b) => Number(open(a)) - Number(open(b)) || when(a) - when(b) || a.createdAt.getTime() - b.createdAt.getTime());
}

// Where an ended read sits among the book's reads, as a createdAt: its own dates, or just before the
// earliest read for an undated one. Never after an open read, which stays the latest.
export function readCreatedAt(read: Pick<ReadForBook, "startedAt" | "finishedAt">, others: (ReadForBook & { createdAt: Date })[]) {
  const openRead = others.find((r) => (OPEN_READ_STATUSES as readonly Status[]).includes(r.status));
  const earliest = others.reduce<number | null>((min, r) => (min === null || r.createdAt.getTime() < min ? r.createdAt.getTime() : min), null);
  let at = (read.startedAt ?? read.finishedAt)?.getTime() ?? (earliest !== null ? earliest - 60_000 : Date.now());
  if (openRead && at >= openRead.createdAt.getTime()) at = openRead.createdAt.getTime() - 60_000;
  return new Date(at);
}

// The book fields that mirror its reads (schema.prisma, Book): how many times it was finished, and the dates
// and rating of the read its shelf reflects. Called after a read is added, edited or deleted.
export function bookFieldsFromReads(book: Pick<Book, "status" | "rating">, reads: (ReadForBook & { createdAt: Date })[]) {
  const ordered = readOrder(reads);
  const last = (status: Status) => ordered.filter((r) => r.status === status).pop() ?? null;
  const finish = last("COMPLETED");
  const fields: { timesRead: number; completedAt: Date | null; startedAt?: Date | null; stoppedAt?: Date | null; rating?: number | null } = {
    timesRead: ordered.filter((r) => r.status === "COMPLETED").length,
    // The last finish, kept while a re-read is open as it always has been.
    completedAt: finish?.finishedAt ?? null,
  };
  if (book.status === "COMPLETED" && finish) {
    fields.startedAt = finish.startedAt;
    // Reads from before ratings were kept per read have none: the book's own rating stands.
    fields.rating = finish.rating ?? book.rating;
  }
  if (book.status === "DNF") {
    const dnf = last("DNF");
    if (dnf) {
      fields.startedAt = dnf.startedAt;
      fields.stoppedAt = dnf.finishedAt;
      fields.rating = dnf.rating ?? book.rating;
    }
  }
  if (book.status === "STARTED" || book.status === "PAUSED") {
    const open = ordered[ordered.length - 1];
    if (open && (OPEN_READ_STATUSES as readonly Status[]).includes(open.status)) fields.startedAt = open.startedAt;
  }
  return fields;
}
