import { z } from "zod";
import type { Book, Status } from "@prisma/client";

// Kept free of "@/" imports so scripts/backfill-reads.ts can load it with plain Node.

// Half-star ratings: 0.5, 1, 1.5 … 5. Halves are exact in floating point, so multipleOf is safe.
export const ratingSchema = z.number().min(0.5).max(5).multipleOf(0.5);
// What the API accepts: a rating, or null/0 to clear it.
export const ratingInputSchema = z.union([ratingSchema, z.literal(0), z.null()]).transform((n) => n || null);
export const RATING_ERROR = "Rating must be from 0.5 to 5 stars, in half-star steps";

// A read is open while it can still be picked back up.
export const OPEN_READ_STATUSES = ["STARTED", "PAUSED"] as const satisfies readonly Status[];
// Statuses whose book has at least one read. NOT_STARTED books may still have closed DNF reads.
export const READ_STATUSES = ["STARTED", "PAUSED", "COMPLETED", "DNF"] as const satisfies readonly Status[];

type BookForRead = Pick<Book, "id" | "userId" | "status" | "startedAt" | "completedAt" | "stoppedAt" | "rating" | "currentPage" | "pages"
  | "progressUnit" | "audioMinutes" | "currentMinute">;

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
  { now, finishedThisYear, rating, earlierRating }: { now: Date; finishedThisYear: boolean; rating: number | null | undefined; earlierRating: number | null },
) {
  const finished = to === "COMPLETED";
  const ended = finished || to === "DNF";
  const runningTime = book.progressUnit === "MINUTES" ? book.audioMinutes : null;
  return {
    status: to,
    // As when adding: Reading starts today, and a past read stays undated unless finished this year.
    startedAt: to === "STARTED" ? now : null,
    stoppedAt: to === "DNF" ? now : null,
    completedAt: finished ? (finishedThisYear ? now : null) : book.completedAt,
    currentPage: finished ? book.pages : 0,
    currentMinute: runningTime ? (finished ? runningTime : 0) : book.currentMinute,
    timesRead: Math.max(0, book.timesRead + (finished ? 1 : 0) - (book.status === "COMPLETED" ? 1 : 0)),
    rating: ended && rating !== undefined ? rating : earlierRating,
  };
}
