import type { Status } from "@prisma/client";

// Kept free of "@/" imports (type-only imports are fine) so scripts/test/import.test.ts runs under plain Node.

export type ImportSource = "goodreads" | "storygraph" | "bookmark";

export const SOURCE_LABEL: Record<ImportSource, string> = {
  goodreads: "Goodreads",
  storygraph: "StoryGraph",
  bookmark: "Bookmark",
};

// A past read. Dates are ISO strings so rows survive a JSON round trip through the ImportJob.
export interface ImportedRead {
  startedAt: string | null;
  finishedAt: string | null;
}

// One CSV row, mapped onto Bookmark's model but not yet matched or saved.
export interface ImportRow {
  // 1-based data row (the header is row 0), for messages.
  line: number;
  title: string;
  author: string;
  isbn13: string | null;
  isbn10: string | null;
  status: Status;
  // 0.5 to 5 in half-star steps, or null for unrated.
  rating: number | null;
  pages: number | null;
  // Only Bookmark's own export carries progress.
  currentPage: number | null;
  review: string | null;
  // Goodreads "Private Notes".
  privateNotes: string | null;
  genre: string | null;
  favourite: boolean;
  addedAt: string | null;
  // Book.startedAt: the current read's start (or the latest read's, for a finished book).
  startedAt: string | null;
  // Book.completedAt: the latest finish. Kept through a re-read, as the app does.
  completedAt: string | null;
  // DNF/PAUSED: when the book was put down, if the file says.
  stoppedAt: string | null;
  // Finished reads, oldest first. Its length is Book.timesRead. Undated ones come first.
  completedReads: ImportedRead[];
  // Known up front for Bookmark's own export, which needs no Open Library lookup.
  workKey: string | null;
  coverUrl: string | null;
}

// What Open Library knows about a row. Null in the job's matches array means "looked, found nothing".
export interface ImportMatch {
  workKey: string;
  coverUrl: string | null;
  pages: number | null;
  genre: string | null;
  by: "isbn13" | "isbn" | "title";
}

export interface ParsedImport {
  source: ImportSource;
  rows: ImportRow[];
  // Rows dropped for having no title (with their line numbers).
  skippedLines: number[];
}
