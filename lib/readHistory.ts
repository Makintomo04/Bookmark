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
