import type { Status } from "@prisma/client";
import { parseCsvRecords } from "./csv.ts";
import { genreFromTags } from "./genre.ts";
import type { ImportRow, ImportSource, ImportedRead, ParsedImport } from "./types.ts";

// Detects Goodreads, StoryGraph and Bookmark CSV exports and maps each row onto Bookmark's model.
// Kept free of "@/" imports so scripts/test-import.ts can load it with plain Node.

const STATUSES: Status[] = ["NOT_STARTED", "STARTED", "COMPLETED", "DNF", "PAUSED"];

export class ImportFormatError extends Error {}

// ---- Detection ---------------------------------------------------------------------------

export function detectSource(headers: string[]): ImportSource | null {
  const has = (h: string) => headers.includes(h);
  // Bookmark's export uses Goodreads' columns, so check its own columns first.
  if (has("Title") && has("Bookmark Status")) return "bookmark";
  if (has("Title") && has("Author") && has("Exclusive Shelf")) return "goodreads";
  if (has("Title") && has("Authors") && has("Read Status")) return "storygraph";
  return null;
}

// ---- Field helpers -----------------------------------------------------------------------

const text = (v: string | undefined) => (v ?? "").trim();
const orNull = (v: string | undefined) => text(v) || null;

function int(v: string | undefined): number | null {
  const n = parseInt(text(v).replace(/,/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Goodreads and StoryGraph store whole stars (or quarters); Bookmark stores halves. 0 means unrated.
export function roundRating(value: string | number | null | undefined): number | null {
  const n = typeof value === "number" ? value : parseFloat(text(value ?? ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5, Math.max(0.5, Math.round(n * 2) / 2));
}

// Goodreads wraps ISBNs as ="0441013597" so spreadsheets keep the leading zero; StoryGraph's
// ISBN/UID column holds either an ISBN or its own id.
export function cleanIsbn(raw: string | undefined): { isbn13: string | null; isbn10: string | null } {
  const s = text(raw).replace(/^="?|"$/g, "").replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{13}$/.test(s)) return { isbn13: s, isbn10: null };
  if (/^\d{9}[\dX]$/.test(s)) return { isbn13: null, isbn10: s };
  return { isbn13: null, isbn10: null };
}

// "2023/01/05", "2023-01-05", "2023/1/5", "2023/01" or "2023". Stored as UTC midnight, which is how
// lib/export.ts writes dates back out, so a Bookmark export round-trips to the same CSV.
export function parseDate(raw: string | undefined): string | null {
  const m = text(raw).match(/^(\d{4})(?:[/-](\d{1,2})(?:[/-](\d{1,2}))?)?$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2] ?? 1), Number(m[3] ?? 1)];
  if (y < 1000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Goodreads reviews are HTML ("<br/>" for line breaks, "<i>" for emphasis). Bookmark stores plain text.
export function cleanReview(raw: string | undefined): string | null {
  const s = text(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s || null;
}

// "The Fellowship of the Ring (The Lord of the Rings, #1)" → "The Fellowship of the Ring".
// Goodreads appends the series; Open Library and books added by hand don't, which would defeat de-duplication.
export function stripSeries(title: string) {
  const stripped = title.replace(/\s*\([^()]*#\s*[\d.]+(?:-[\d.]+)?\)\s*$/, "").trim();
  return stripped || title.trim();
}

const splitList = (v: string | undefined) =>
  text(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const DNF_SHELF = /^(dnf|did[\s_-]*not[\s_-]*finish|abandon(ed)?|gave[\s_-]*up|didnt[\s_-]*finish|unfinished)$/i;
const PAUSED_SHELF = /^(paused|on[\s_-]*hold)$/i;
const FAVOURITE_SHELF = /^favou?rites?$/i;

export function statusForShelf(shelf: string): Status | null {
  const s = shelf.trim().toLowerCase();
  if (s === "read") return "COMPLETED";
  if (s === "currently-reading") return "STARTED";
  if (s === "to-read") return "NOT_STARTED";
  if (DNF_SHELF.test(s)) return "DNF";
  if (PAUSED_SHELF.test(s)) return "PAUSED";
  return null;
}

// n reads where only the latest has dates: n-1 undated ones first, as scripts/backfill-reads.ts does.
function readsWithLatest(count: number, latest: ImportedRead): ImportedRead[] {
  if (count <= 0) return [];
  return [...Array.from({ length: count - 1 }, () => ({ startedAt: null, finishedAt: null })), latest];
}

const base = (line: number): Omit<ImportRow, "title" | "author" | "status"> => ({
  line,
  isbn13: null,
  isbn10: null,
  rating: null,
  pages: null,
  currentPage: null,
  review: null,
  privateNotes: null,
  genre: null,
  favourite: false,
  addedAt: null,
  startedAt: null,
  completedAt: null,
  stoppedAt: null,
  completedReads: [],
  workKey: null,
  coverUrl: null,
});

// ---- Goodreads ---------------------------------------------------------------------------

function goodreadsRow(r: Record<string, string>, line: number): ImportRow {
  const exclusive = text(r["Exclusive Shelf"]).toLowerCase();
  const shelves = splitList(r["Bookshelves"]);
  let status: Status = statusForShelf(exclusive) ?? "NOT_STARTED";
  // A custom shelf like "dnf" or "abandoned" outranks the exclusive shelf: Goodreads has no DNF of its own,
  // so readers file those books under read or to-read and tag them.
  if (shelves.some((s) => DNF_SHELF.test(s))) status = "DNF";
  else if (status !== "COMPLETED" && shelves.some((s) => PAUSED_SHELF.test(s))) status = "PAUSED";

  const dateRead = parseDate(r["Date Read"]);
  const dateStarted = parseDate(r["Date Started"]);
  const readCount = int(r["Read Count"]) ?? 0;

  let completedCount = readCount;
  if (status === "COMPLETED") completedCount = Math.max(1, readCount);
  // Readers who shelve a DNF as "read" got a read counted for it.
  if (status === "DNF" && exclusive === "read") completedCount = Math.max(0, readCount - 1);

  const finished = status === "DNF" ? null : dateRead;
  const isbn = cleanIsbn(r["ISBN"]);
  const isbn13 = cleanIsbn(r["ISBN13"]).isbn13;

  return {
    ...base(line),
    title: stripSeries(text(r["Title"])),
    author: text(r["Author"]) || "Unknown",
    isbn13: isbn13 ?? isbn.isbn13,
    isbn10: isbn.isbn10,
    status,
    rating: roundRating(r["My Rating"]),
    pages: int(r["Number of Pages"]) || null,
    review: cleanReview(r["My Review"]),
    privateNotes: orNull(r["Private Notes"]),
    genre: genreFromTags(shelves),
    favourite: shelves.some((s) => FAVOURITE_SHELF.test(s)),
    addedAt: parseDate(r["Date Added"]),
    // Goodreads' current export has no start date; older ones (and some tools) add "Date Started".
    startedAt: status === "NOT_STARTED" ? null : dateStarted,
    completedAt: completedCount > 0 ? finished : null,
    stoppedAt: status === "DNF" ? dateRead : null,
    completedReads: readsWithLatest(completedCount, {
      startedAt: status === "COMPLETED" ? dateStarted : null,
      finishedAt: finished,
    }),
  };
}

// ---- StoryGraph --------------------------------------------------------------------------

// "Dates Read": one or more "start-end" ranges (either end may be missing), comma separated.
export function parseDateRanges(raw: string | undefined): ImportedRead[] {
  return splitList(raw)
    .map((part) => {
      const [a, b] = part.split(/\s*-\s*(?=\d{4}|$)/);
      if (b === undefined) return { startedAt: null, finishedAt: parseDate(a) };
      return { startedAt: parseDate(a), finishedAt: parseDate(b) };
    })
    .filter((r) => r.startedAt || r.finishedAt)
    .sort((x, y) => (x.finishedAt ?? x.startedAt ?? "").localeCompare(y.finishedAt ?? y.startedAt ?? ""));
}

function storygraphRow(r: Record<string, string>, line: number): ImportRow {
  const status = statusForShelf(text(r["Read Status"])) ?? "NOT_STARTED";
  const ranges = parseDateRanges(r["Dates Read"]);
  const lastRead = parseDate(r["Last Date Read"]);
  const readCount = int(r["Read Count"]) ?? 0;
  const tags = [...splitList(r["Tags"]), ...splitList(r["Moods"])];
  const isbn = cleanIsbn(r["ISBN/UID"]);

  // The current read (open, or the DNF) is the last range; earlier ranges are finished reads.
  let current: ImportedRead | null = null;
  let finishedRanges = ranges;
  if (status === "STARTED" || status === "PAUSED" || status === "DNF") {
    const last = ranges[ranges.length - 1];
    if (last && (status === "DNF" || !last.finishedAt)) {
      current = last;
      finishedRanges = ranges.slice(0, -1);
    }
  }
  if (status === "COMPLETED" && finishedRanges.length === 0 && lastRead) {
    finishedRanges = [{ startedAt: null, finishedAt: lastRead }];
  }

  const minCompleted = status === "COMPLETED" ? 1 : 0;
  // The count can be higher than the dated ranges (rereads logged without dates).
  const completedCount = Math.max(minCompleted, finishedRanges.length, status === "DNF" ? 0 : readCount);
  const undated = Math.max(0, completedCount - finishedRanges.length);
  const completedReads = [
    ...Array.from({ length: undated }, () => ({ startedAt: null, finishedAt: null })),
    ...finishedRanges,
  ];
  const latest = completedReads[completedReads.length - 1];

  return {
    ...base(line),
    title: text(r["Title"]),
    // Bookmark keeps one author per book, as Goodreads' "Author" column does.
    author: splitList(r["Authors"])[0] || "Unknown",
    isbn13: isbn.isbn13,
    isbn10: isbn.isbn10,
    status,
    rating: roundRating(r["Star Rating"]),
    review: cleanReview(r["Review"]),
    genre: genreFromTags(tags),
    favourite: tags.some((t) => FAVOURITE_SHELF.test(t)),
    addedAt: parseDate(r["Date Added"]),
    startedAt: current ? current.startedAt : status === "COMPLETED" ? latest?.startedAt ?? null : null,
    completedAt: latest?.finishedAt ?? null,
    stoppedAt: status === "DNF" ? current?.finishedAt ?? lastRead : null,
    completedReads,
  };
}

// ---- Bookmark ----------------------------------------------------------------------------

// Bookmark's own export (lib/export.ts). Prefers the exact Bookmark columns over the Goodreads ones.
function bookmarkRow(r: Record<string, string>, line: number): ImportRow {
  const rawStatus = text(r["Bookmark Status"]).toUpperCase() as Status;
  const status: Status = STATUSES.includes(rawStatus) ? rawStatus : statusForShelf(text(r["Exclusive Shelf"])) ?? "NOT_STARTED";
  const timesRead = int(r["Read Count"]) ?? 0;
  const completedAt = parseDate(r["Date Read"]);
  const startedAt = parseDate(r["Date Started"]);
  const exact = text(r["Bookmark Rating"]);
  const workKey = text(r["Open Library Work Key"]).match(/OL\d+W/)?.[0] ?? null;

  return {
    ...base(line),
    title: text(r["Title"]),
    author: text(r["Author"]) || "Unknown",
    status,
    rating: roundRating(exact || r["My Rating"]),
    pages: int(r["Number of Pages"]),
    currentPage: int(r["Current Page"]),
    // Exported reviews are already plain text; keep them byte for byte.
    review: r["My Review"] ? r["My Review"] : null,
    genre: orNull(r["Genre"]),
    favourite: text(r["Favourite"]).toLowerCase() === "true" || splitList(r["Bookshelves"]).some((s) => FAVOURITE_SHELF.test(s)),
    addedAt: parseDate(r["Date Added"]),
    startedAt,
    completedAt,
    completedReads: readsWithLatest(timesRead, {
      startedAt: status === "COMPLETED" ? startedAt : null,
      finishedAt: completedAt,
    }),
    workKey,
    coverUrl: orNull(r["Cover Image"]),
  };
}

// ---- Entry point -------------------------------------------------------------------------

const MAPPERS: Record<ImportSource, (r: Record<string, string>, line: number) => ImportRow> = {
  goodreads: goodreadsRow,
  storygraph: storygraphRow,
  bookmark: bookmarkRow,
};

export function parseImport(csvText: string): ParsedImport {
  const { headers, records } = parseCsvRecords(csvText);
  const source = detectSource(headers);
  if (!source) {
    throw new ImportFormatError(
      "That doesn't look like a Goodreads, StoryGraph or Bookmark export. Upload the CSV file exactly as you downloaded it."
    );
  }
  const rows: ImportRow[] = [];
  const skippedLines: number[] = [];
  records.forEach((record, i) => {
    const row = MAPPERS[source](record, i + 1);
    if (row.title) rows.push(row);
    else skippedLines.push(i + 1);
  });
  return { source, rows, skippedLines };
}
