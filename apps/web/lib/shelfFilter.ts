import type { EditionFormat, Status } from "@prisma/client";

// Search, sort and filter over the reader's own shelf (BookGrid's toolbar). Works on the /api/books
// payload in the browser; the same params in a URL (/shelf?author=…) are how stats and Ask the shelf
// open a filtered shelf. Kept free of "@/" imports so scripts/test/shelfFilter.test.ts runs under plain Node.

export type ShelfKey = "reading" | "paused" | "want" | "finished" | "dnf" | "notInterested";

export const SHELF_STATUS: Record<ShelfKey, Status> = {
  reading: "STARTED",
  paused: "PAUSED",
  want: "NOT_STARTED",
  finished: "COMPLETED",
  dnf: "DNF",
  notInterested: "NOT_INTERESTED",
};

export const SHELF_TITLE: Record<ShelfKey, string> = {
  reading: "Currently reading",
  paused: "Paused",
  want: "Want to read",
  finished: "Finished",
  dnf: "Did not finish",
  notInterested: "Will not read",
};

// Each shelf's page: /u/<username>/shelf/<slug>.
export const SHELF_SLUG: Record<ShelfKey, string> = {
  reading: "reading",
  paused: "paused",
  want: "want-to-read",
  finished: "finished",
  dnf: "did-not-finish",
  notInterested: "will-not-read",
};

export const shelfFromSlug = (slug: string): ShelfKey | null =>
  (Object.keys(SHELF_SLUG) as ShelfKey[]).find((k) => SHELF_SLUG[k] === slug) ?? null;

// A shelf's own page, carrying any search, sort and filters (the shelf itself is in the path).
export function shelfPageHref(username: string, shelf: ShelfKey, filter: Partial<ShelfFilter> = {}) {
  const query = shelfParams({ ...filter, shelf: null }).toString();
  return `/u/${encodeURIComponent(username)}/shelf/${SHELF_SLUG[shelf]}${query ? `?${query}` : ""}`;
}

export const shelfOf = (status: Status): ShelfKey =>
  (Object.keys(SHELF_STATUS) as ShelfKey[]).find((k) => SHELF_STATUS[k] === status) ?? "want";

// "recent" is each shelf's own order: last finished first on Finished, last added on Want to read, and so on.
export const SHELF_SORTS = ["recent", "finished", "added", "rating", "title", "author", "length"] as const;
export type ShelfSort = typeof SHELF_SORTS[number];

export const SORT_LABEL: Record<ShelfSort, string> = {
  recent: "Most recent",
  finished: "Date finished",
  added: "Date added",
  rating: "Rating",
  title: "Title",
  author: "Author",
  length: "Length",
};

export const FORMATS = ["PAPERBACK", "HARDCOVER", "EBOOK", "AUDIOBOOK"] as const satisfies readonly EditionFormat[];
export const FORMAT_LABEL: Record<EditionFormat, string> = {
  PAPERBACK: "Paperback",
  HARDCOVER: "Hardcover",
  EBOOK: "Ebook",
  AUDIOBOOK: "Audiobook",
};

export interface ShelfFilter {
  q: string;
  // One shelf on its own (a shelf's "See all"), or null for every shelf.
  shelf: ShelfKey | null;
  sort: ShelfSort;
  // Finished in this year, and month (1 to 12) within it.
  year: number | null;
  month: number | null;
  genre: string | null;
  // A half-star bucket as /stats draws them (4.5 holds 4.5 and 4.75), or "unrated".
  rating: number | "unrated" | null;
  format: EditionFormat | null;
  tag: string | null;
  // Exact author name, as /stats' top authors link to it.
  author: string | null;
}

export const EMPTY_FILTER: ShelfFilter = {
  q: "", shelf: null, sort: "recent", year: null, month: null, genre: null, rating: null, format: null, tag: null, author: null,
};

type When = Date | string | null | undefined;

export interface ShelfBook {
  id: string;
  title: string;
  author: string;
  status: Status;
  rating: number | null;
  pages: number;
  genre: string | null;
  tags?: string[] | null;
  createdAt: When;
  startedAt: When;
  completedAt: When;
  stoppedAt?: When;
  progressUnit?: "PAGES" | "MINUTES" | null;
  audioMinutes?: number | null;
  // The catalogue edition's format, sent with /api/books.
  format?: EditionFormat | null;
}

// ---- URL params ----------------------------------------------------------------------------------

const isShelf = (v: string | null): v is ShelfKey => !!v && v in SHELF_STATUS;
const isSort = (v: string | null): v is ShelfSort => !!v && (SHELF_SORTS as readonly string[]).includes(v);
const isFormat = (v: string | null): v is EditionFormat => !!v && (FORMATS as readonly string[]).includes(v);
const intIn = (v: string | null, min: number, max: number) => {
  if (!v || !/^\d{1,4}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};
const textParam = (v: string | null, max = 120) => (v && v.trim() ? v.trim().slice(0, max) : null);

export function parseShelfParams(params: { get(name: string): string | null }): ShelfFilter {
  const rating = params.get("rating");
  const ratingValue = rating === "unrated" ? "unrated" : rating && /^[0-5](\.5)?$/.test(rating) && Number(rating) >= 0.5 ? Number(rating) : null;
  const year = intIn(params.get("year"), 1900, 2999);
  return {
    q: textParam(params.get("q"), 200) ?? "",
    shelf: isShelf(params.get("shelf")) ? params.get("shelf") as ShelfKey : null,
    sort: isSort(params.get("sort")) ? params.get("sort") as ShelfSort : "recent",
    year,
    month: year ? intIn(params.get("month"), 1, 12) : null,
    genre: textParam(params.get("genre")),
    rating: ratingValue,
    format: isFormat(params.get("format")) ? params.get("format") as EditionFormat : null,
    tag: textParam(params.get("tag"), 60),
    author: textParam(params.get("author"), 200),
  };
}

// The filter as URL params, leaving out anything at its default.
export function shelfParams(filter: Partial<ShelfFilter>): URLSearchParams {
  const params = new URLSearchParams();
  const f = { ...EMPTY_FILTER, ...filter };
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.shelf) params.set("shelf", f.shelf);
  if (f.sort !== "recent") params.set("sort", f.sort);
  if (f.year) params.set("year", String(f.year));
  if (f.year && f.month) params.set("month", String(f.month));
  if (f.genre) params.set("genre", f.genre);
  if (f.rating !== null) params.set("rating", String(f.rating));
  if (f.format) params.set("format", f.format);
  if (f.tag) params.set("tag", f.tag);
  if (f.author) params.set("author", f.author);
  return params;
}

// True when anything narrows the shelf: the grid then shows one list of matches instead of every shelf.
export const isNarrowed = (f: ShelfFilter) =>
  !!(f.q.trim() || f.year || f.genre || f.rating !== null || f.format || f.tag || f.author);

// ---- Matching ------------------------------------------------------------------------------------

// Lower case, accents off: "Brontë" finds "Bronte" and the other way round.
export const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const time = (d: When) => (d ? new Date(d).getTime() : 0);

export const ratingBucket = (rating: number) => Math.max(0.5, Math.floor(rating * 2) / 2);

export function formatOf(book: Pick<ShelfBook, "format" | "progressUnit">): EditionFormat | null {
  return book.format ?? (book.progressUnit === "MINUTES" ? "AUDIOBOOK" : null);
}

export function matchesFilter(book: ShelfBook, f: ShelfFilter): boolean {
  if (f.shelf && book.status !== SHELF_STATUS[f.shelf]) return false;
  const terms = fold(f.q).split(/\s+/).filter(Boolean);
  if (terms.length) {
    const hay = fold(`${book.title} ${book.author} ${(book.tags ?? []).join(" ")}`);
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  if (f.year) {
    if (!book.completedAt) return false;
    const done = new Date(book.completedAt);
    if (done.getFullYear() !== f.year) return false;
    if (f.month && done.getMonth() + 1 !== f.month) return false;
  }
  if (f.genre && fold(book.genre ?? "") !== fold(f.genre)) return false;
  if (f.rating === "unrated" && book.rating) return false;
  if (typeof f.rating === "number" && (!book.rating || ratingBucket(book.rating) !== f.rating)) return false;
  if (f.format && formatOf(book) !== f.format) return false;
  if (f.tag && !(book.tags ?? []).some((t) => fold(t) === fold(f.tag!))) return false;
  if (f.author && fold(book.author) !== fold(f.author)) return false;
  return true;
}

// ---- Sorting -------------------------------------------------------------------------------------

// Each shelf's own order ("recent").
function recentTime(book: ShelfBook) {
  switch (book.status) {
    case "STARTED": return time(book.startedAt);
    case "COMPLETED": return time(book.completedAt);
    case "PAUSED":
    case "DNF": return time(book.stoppedAt);
    default: return time(book.createdAt);
  }
}

// "Ursula K. Le Guin" sorts under G, as a library would shelve the surname's last word.
const surname = (author: string) => fold(author.split(",")[0].trim().split(/\s+/).pop() ?? author);

export function lengthOf(book: Pick<ShelfBook, "pages" | "progressUnit" | "audioMinutes">) {
  // Audiobooks with no page count compare by running time at about a page a minute and a half.
  if (book.pages > 0) return book.pages;
  return book.progressUnit === "MINUTES" && book.audioMinutes ? Math.round(book.audioMinutes / 1.5) : 0;
}

const byText = (a: string, b: string) => a.localeCompare(b, "en-GB", { sensitivity: "base", numeric: true });

export function sortBooks<T extends ShelfBook>(books: T[], sort: ShelfSort): T[] {
  const sorted = books.slice();
  // Ties fall back to the shelf's own order, so a sort never shuffles books it considers equal.
  const recent = (a: T, b: T) => recentTime(b) - recentTime(a);
  const compare: Record<ShelfSort, (a: T, b: T) => number> = {
    recent,
    // Undated finishes (and unfinished books) go last.
    finished: (a, b) => (time(b.completedAt) - time(a.completedAt)) || recent(a, b),
    added: (a, b) => (time(b.createdAt) - time(a.createdAt)) || recent(a, b),
    rating: (a, b) => ((b.rating ?? 0) - (a.rating ?? 0)) || recent(a, b),
    title: (a, b) => byText(a.title, b.title) || recent(a, b),
    author: (a, b) => byText(surname(a.author), surname(b.author)) || byText(a.author, b.author) || byText(a.title, b.title),
    length: (a, b) => (lengthOf(b) - lengthOf(a)) || recent(a, b),
  };
  return sorted.sort(compare[sort]);
}

// ---- Filter options ------------------------------------------------------------------------------

// What the filter menus offer: only values some book on the shelf has.
export function filterOptions(books: ShelfBook[]) {
  const years = new Set<number>();
  const genres = new Map<string, string>();
  const tags = new Map<string, string>();
  const formats = new Set<EditionFormat>();
  let unrated = false;
  const ratings = new Set<number>();
  for (const b of books) {
    if (b.completedAt) years.add(new Date(b.completedAt).getFullYear());
    if (b.genre?.trim()) genres.set(fold(b.genre), b.genre.trim());
    for (const t of b.tags ?? []) if (t.trim()) tags.set(fold(t), t.trim());
    const format = formatOf(b);
    if (format) formats.add(format);
    if (b.rating) ratings.add(ratingBucket(b.rating));
    else if (b.status === "COMPLETED" || b.status === "DNF") unrated = true;
  }
  return {
    years: Array.from(years).sort((a, b) => b - a),
    genres: Array.from(genres.values()).sort(byText),
    tags: Array.from(tags.values()).sort(byText),
    formats: FORMATS.filter((f) => formats.has(f)),
    ratings: Array.from(ratings).sort((a, b) => b - a),
    unrated,
  };
}

// ---- "Have I read…?" ------------------------------------------------------------------------------

// Ask the shelf suggests books the reader hasn't read, so a question about their own reading ("did I read
// that slow-burn fantasy in 2021?") goes to shelf search instead. Returns the filter it implies, or null
// when the question isn't about their own shelf. `genres` are the genre labels to look for (lib/genres.ts).
const OWN_SHELF = [
  /\b(have|did|had)\s+i\s+(ever\s+|already\s+)?(read|finish(ed)?|rate[d]?)\b/i,
  /\bi\s+(have\s+|had\s+)?(already\s+|once\s+|last\s+)?read\b.*\b(that|which|the one|in\s+(19|20)\d{2}|last year|this year)\b/i,
  /\bwhat\s+(was|is)\s+(that|the)\b.*\bi\s+(read|finished|loved|liked|rated)\b/i,
  /\b(on|from|in)\s+my\s+(own\s+)?(shelf|shelves|library|finished books)\b/i,
  /\bbooks?\s+i('ve| have)\s+(read|finished)\b/i,
];

export function shelfQuestion(query: string, genres: readonly string[] = [], now = new Date()): Partial<ShelfFilter> | null {
  if (!OWN_SHELF.some((re) => re.test(query))) return null;
  const filter: Partial<ShelfFilter> = { shelf: "finished" };
  const year = query.match(/\b(19\d{2}|20\d{2})\b/);
  if (year) filter.year = Number(year[1]);
  else if (/\blast year\b/i.test(query)) filter.year = now.getFullYear() - 1;
  else if (/\bthis year\b/i.test(query)) filter.year = now.getFullYear();
  // Whole words only: "romance" in "romantasy" isn't Romance.
  const words = ` ${fold(query).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const genre = genres.find((g) => words.includes(` ${fold(g).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `));
  if (genre) filter.genre = genre;
  // A title in quotes, or "by <author>", is something shelf search can match.
  // Double quotes or curly single ones: a plain apostrophe is too often "I've".
  const quoted = query.match(/["“]([^"”]{2,80})["”]|‘([^’]{2,80})’/);
  const by = query.match(/\bby\s+([A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){0,3})/u);
  if (quoted) filter.q = (quoted[1] ?? quoted[2]).trim();
  else if (by) filter.q = by[1].trim();
  return filter;
}
