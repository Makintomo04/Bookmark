import type { EditionFormat, Status } from "@prisma/client";
import type { Series } from "../catalog/normalise.ts";

// Kept free of "@/" imports (type-only imports are fine) so scripts/test/import.test.ts runs under plain Node.

// "list": a pasted list or plain text file (lib/import/text.ts). Its books come only from the search:
// rows nothing matched are left out, not added as typed.
export type ImportSource = "goodreads" | "storygraph" | "bookmark" | "list";

export const SOURCE_LABEL: Record<ImportSource, string> = {
  goodreads: "Goodreads",
  storygraph: "StoryGraph",
  bookmark: "Bookmark",
  list: "Your list",
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
  // Goodreads "Binding", StoryGraph "Format" (or an "audiobook"/"kindle" shelf): which Edition this is (lib/catalog.ts).
  format: EditionFormat | null;
  publisher: string | null;
  publishedYear: number | null;
  // From a Goodreads title: "(The Stormlight Archive, #2)".
  series: Series | null;
  status: Status;
  // 0.25 to 5 in quarter-star steps, or null for unrated.
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

// An Open Library work that could be a row's book: what the search returned, kept so the reader (or the
// model) can choose among them without another request.
export interface ImportCandidate {
  workKey: string;
  title: string | null;
  authors: string[];
  year: number | null;
  coverUrl: string | null;
  pages: number | null;
  subjects: string[];
}

// What Open Library knows about a row. Null in the job's matches array means "looked, found nothing".
export interface ImportMatch {
  workKey: string;
  coverUrl: string | null;
  pages: number | null;
  genre: string | null;
  // isbn13/isbn/title: the lookup passes. llm: the model chose among candidates. reader: chosen in the review step.
  by: "isbn13" | "isbn" | "title" | "llm" | "reader";
  // What the catalog Work is created from. Optional: matches saved before these existed lack them.
  title?: string | null;
  authors?: string[];
  subjects?: string[];
  year?: number | null;
  // 0 to 1. Absent for matches made before scoring existed, which count as confident.
  confidence?: number;
  // The reader confirmed or chose this match in the review step.
  reviewed?: boolean;
  // Other works that could be this book, for "pick another".
  candidates?: ImportCandidate[];
  // The row's ISBN is filed under another book on Open Library (an audiobook or ebook ISBN mis-filed,
  // a boxed set). The catalog must not file the book by that ISBN, or the wrong edition wins.
  isbnDoubtful?: boolean;
}

// Looked, nothing certain: what Open Library offered, and whether the model has had a go at them.
// Undefined `llm` means the model hasn't been asked yet.
export interface ImportNoMatch {
  workKey: null;
  candidates: ImportCandidate[];
  llm?: "none" | "skipped" | "failed" | "rejected";
  reviewed?: boolean;
  isbnDoubtful?: boolean;
}

// ISBNs the catalog may file the row by: not when the lookups showed the ISBN points at another book.
export const isbnsFor = (row: { isbn13: string | null; isbn10: string | null }, entry: MatchEntry | undefined) =>
  entry?.isbnDoubtful ? { isbn13: null, isbn10: null } : { isbn13: row.isbn13, isbn10: row.isbn10 };

export type MatchEntry = ImportMatch | ImportNoMatch | null;

// Matches scored below this are shown to the reader before they're filed; at or above, they file as is.
export const CONFIDENT = 0.85;

export const asMatch = (entry: MatchEntry | undefined): ImportMatch | null => (entry && entry.workKey ? entry : null);

export const isUncertain = (match: ImportMatch | null | undefined): match is ImportMatch =>
  !!match && match.confidence !== undefined && match.confidence < CONFIDENT && !match.reviewed;

// The match a row is filed under. An uncertain match the reader never checked is dropped, so the
// book is added as typed (and can be matched afterwards) rather than filed under the wrong work.
export const effectiveMatch = (entry: MatchEntry | undefined): ImportMatch | null => {
  const match = asMatch(entry);
  return match && !isUncertain(match) ? match : null;
};

// A row the pre-cleaner (lib/import/clean.ts) set aside rather than let it stop the file.
export interface QuarantinedRow {
  line: number;
  reason: string;
  // Whatever identifies it: an author, an ISBN, a shelf.
  detail: string | null;
}

// What the pre-cleaner had to decide about the file, for the preview and the summary.
export interface FileNotes {
  quarantined: QuarantinedRow[];
  // How "03/04/2024"-style dates were read. Null when the file has none.
  dayFirst: boolean | null;
  // True when nothing in the file settled day-first vs month-first, so day-first was assumed.
  dateOrderGuessed: boolean;
  // Date cells that couldn't be read. Left blank rather than guessed; the first few are listed.
  unreadableDates: { line: number; column: string; value: string }[];
  unreadableDateCount: number;
  // A pasted list only: whether the model read it, the rules did (no key, or the model failed), or both.
  listReadBy?: "model" | "rules" | "mixed";
}

export const emptyNotes = (): FileNotes => ({
  quarantined: [],
  dayFirst: null,
  dateOrderGuessed: false,
  unreadableDates: [],
  unreadableDateCount: 0,
});

export interface ParsedImport {
  source: ImportSource;
  rows: ImportRow[];
  // Rows dropped for having no title (with their line numbers). Kept for callers; `notes.quarantined` says why.
  skippedLines: number[];
  notes: FileNotes;
}
