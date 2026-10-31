import { authorSlug } from "./authors";

// Series: following one, and the series tracker on the reader's shelf. A series is its name plus its first
// author, since names repeat ("The Expanse" is one series, "Book One" is many): the same rule Catch me up
// uses for earlier books (apps/web/lib/recap.ts earlierInSeries). Entries are the catalog works that carry
// the series, so a book only shows once someone on Bookmark has shelved it. Shared so the web and the app
// group a reader's series the same way.

export type ShelfStatus = "NOT_STARTED" | "STARTED" | "COMPLETED" | "DNF" | "PAUSED" | "NOT_INTERESTED";

const squash = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// "the-stormlight-archive|brandon-sanderson". Case, accents and punctuation aside, so "The Stormlight
// Archive" and "Stormlight Archive, The" don't collide but "the stormlight archive" and "The Stormlight
// Archive" do.
export const seriesKey = (name: string, author: string) => `${seriesSlug(name)}|${authorSlug(author)}`;

// The name half of the key: "the-stormlight-archive".
export const seriesSlug = (name: string) => squash(name).replace(/ /g, "-");

// The series' page on the web, under its first author: "/authors/brandon-sanderson/series/the-stormlight-archive".
export const seriesHref = (name: string, author: string) =>
  `/authors/${encodeURIComponent(authorSlug(author))}/series/${seriesSlug(name)}`;

export const sameSeriesName = (a: string, b: string) => squash(a) === squash(b);

// Series order: 1, 2, 2.5 (a novella between two books), 3. Entries with no known position go last.
export function comparePositions(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

// "Book 3", "Book 2.5". A position that came through as 2.5000001 still reads cleanly.
export const positionLabel = (position: number | null) =>
  position === null ? null : `Book ${Number(position.toFixed(2))}`;

// A new book in a series the reader follows or has started (a NEW_IN_SERIES notification), in the bell, the
// phone's list and its push: "The Alloy of Law is out: Book 4 of Mistborn", or "2 new books in Mistborn,
// starting with The Alloy of Law".
export function seriesNewsText(n: { title: string | null; seriesName: string | null; position: number | null; count: number | null }) {
  const series = n.seriesName ?? "a series you're reading";
  const title = n.title ?? "A new book";
  const count = n.count ?? 1;
  if (count > 1) return `${count} new books in ${series}, starting with ${title}`;
  return n.position === null ? `${title} is out in ${series}` : `${title} is out: ${positionLabel(n.position)} of ${series}`;
}

// A catalog work in the series.
export interface SeriesWork {
  id: string;
  workKey: string | null;
  title: string;
  authors: string[];
  coverUrl: string | null;
  seriesName: string;
  seriesPosition: number | null;
  // Set on a work filed from Hardcover, which has a book page by its id when it has no work key.
  hardcoverId?: string | null;
  // A hand-typed work a librarian gave a page (Work.pageApprovedAt), likewise by its id.
  pageApproved?: boolean;
}

// The reader's copy of one of those works.
export interface SeriesShelfBook {
  bookId: string;
  workId: string;
  status: ShelfStatus;
  timesRead: number;
  coverImage: string | null;
  // Latest of started, finished and last progress, for putting the series read most recently first.
  activeAt: string | null;
}

export interface SeriesEntry {
  workId: string;
  workKey: string | null;
  // The work id its book page goes by when it has no work key (bookHref), else null.
  pageWorkId: string | null;
  title: string;
  author: string;
  coverUrl: string | null;
  position: number | null;
  // On the reader's shelf, and where.
  bookId: string | null;
  status: ShelfStatus | null;
  read: boolean;
}

export interface SeriesTrack {
  key: string;
  name: string;
  author: string;
  // Series order, one work per position.
  entries: SeriesEntry[];
  // Of the entries with a position.
  readCount: number;
  total: number;
  // Any book of it read, being read, paused or put down.
  started: boolean;
  // Started, and nothing with a position left unread (a book marked Will not read counts as done).
  finished: boolean;
  // The next unread book: the first main (whole-numbered) book after the furthest one read, else the
  // first main book skipped, else a novella. It can be the one they're reading now (status STARTED).
  next: SeriesEntry | null;
  following: boolean;
  activeAt: string | null;
}

const isRead = (b: SeriesShelfBook | undefined) => !!b && (b.status === "COMPLETED" || b.timesRead > 0);
const STARTED_STATUSES: ShelfStatus[] = ["STARTED", "COMPLETED", "PAUSED", "DNF"];

// Several catalog works can claim one position (two editions nobody merged): keep the one on the reader's
// shelf, else one linked to Open Library, else one with a cover.
function pickWork(a: SeriesWork, b: SeriesWork, shelf: Map<string, SeriesShelfBook>) {
  const score = (w: SeriesWork) => (shelf.has(w.id) ? 4 : 0) + (w.workKey || w.hardcoverId || w.pageApproved ? 2 : 0) + (w.coverUrl ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

// One series for one reader. `works` may hold works of other series; only this one's are used.
export function buildTrack(
  series: { name: string; author: string },
  works: SeriesWork[],
  shelfBooks: SeriesShelfBook[],
  following: boolean,
): SeriesTrack {
  const key = seriesKey(series.name, series.author);
  const author = authorSlug(series.author);
  const shelf = new Map<string, SeriesShelfBook>();
  for (const b of shelfBooks) {
    // A work shelved twice (a re-read kept as its own copy): the read one tells us more.
    const had = shelf.get(b.workId);
    if (!had || (isRead(b) && !isRead(had))) shelf.set(b.workId, b);
  }

  const mine = works.filter((w) => sameSeriesName(w.seriesName, series.name) && w.authors.some((a) => authorSlug(a) === author));
  const byPosition = new Map<string, SeriesWork>();
  for (const w of mine) {
    const slot = w.seriesPosition === null ? `none:${w.id}` : String(w.seriesPosition);
    const had = byPosition.get(slot);
    byPosition.set(slot, had ? pickWork(had, w, shelf) : w);
  }

  const entries: SeriesEntry[] = Array.from(byPosition.values())
    .sort((a, b) => comparePositions(a.seriesPosition, b.seriesPosition) || a.title.localeCompare(b.title))
    .map((w) => {
      const book = shelf.get(w.id);
      return {
        workId: w.id,
        workKey: w.workKey,
        pageWorkId: !w.workKey && (w.hardcoverId || w.pageApproved) ? w.id : null,
        title: w.title,
        author: w.authors[0] ?? series.author,
        coverUrl: book?.coverImage || w.coverUrl,
        position: w.seriesPosition,
        bookId: book?.bookId ?? null,
        status: book?.status ?? null,
        read: isRead(book),
      };
    });

  const positioned = entries.filter((e) => e.position !== null);
  const unread = positioned.filter((e) => !e.read && e.status !== "NOT_INTERESTED");
  const furthest = Math.max(-Infinity, ...positioned.filter((e) => e.read).map((e) => e.position!));
  // The main books first: a novella at 2.5 sits in order in the list but isn't put ahead of book 3.
  const main = unread.filter((e) => Number.isInteger(e.position));
  const next = main.find((e) => e.position! > furthest) ?? main[0] ?? unread[0] ?? null;
  const ownBooks = entries.flatMap((e) => (e.bookId ? [shelf.get(e.workId)!] : []));
  const started = ownBooks.some((b) => isRead(b) || STARTED_STATUSES.includes(b.status));
  const activeAt = ownBooks.map((b) => b.activeAt).filter((t): t is string => !!t).sort().pop() ?? null;

  return {
    key,
    name: series.name,
    author: series.author,
    entries,
    readCount: positioned.filter((e) => e.read).length,
    total: positioned.length,
    started,
    finished: started && unread.length === 0 && positioned.length > 0,
    next,
    following,
    activeAt,
  };
}

// The tracker's three groups. Series read most recently come first; a followed series not yet started
// comes after every started one in "Next up".
export interface SeriesTrackerGroups {
  started: SeriesTrack[];
  nextUp: SeriesTrack[];
  unfinished: SeriesTrack[];
}

export function trackerGroups(tracks: SeriesTrack[]): SeriesTrackerGroups {
  const recent = tracks.slice().sort((a, b) =>
    Number(b.started) - Number(a.started) || (b.activeAt ?? "").localeCompare(a.activeAt ?? "") || a.name.localeCompare(b.name));
  return {
    started: recent.filter((t) => t.started),
    nextUp: recent.filter((t) => t.next && (t.started || t.following)),
    unfinished: recent.filter((t) => t.started && !t.finished),
  };
}

// "In this series" on a book's page (web book page, app book screen).

// "Book 2 of The Empyrean", or "Part of The Empyrean" when the place isn't known.
export const seriesPlaceLabel = (name: string, position: number | null) =>
  position === null ? `Part of ${name}` : `${positionLabel(position)} of ${name}`;

// Whether an entry is the page's own book: its work, or its place, since the series may list another
// copy of the book there.
export const isPageBook = (entry: SeriesEntry, page: { workId: string | null; position: number | null }) =>
  entry.workId === page.workId || (page.position !== null && entry.position === page.position);

// Where one book stands for the reader: the page's own book, then their shelf, then what they'd read next.
export function entryState(entry: SeriesEntry, track: SeriesTrack, isHere: boolean) {
  if (isHere) return "This book";
  if (entry.read) return "Read";
  if (entry.status === "STARTED") return "Reading";
  if (track.started && track.next?.workId === entry.workId) return "Up next";
  if (entry.status === "NOT_STARTED") return "Want to read";
  return null;
}

// "2 of 5 read". When only some books are in the catalog the total is what we know of.
export const progressLabel = (t: Pick<SeriesTrack, "readCount" | "total">) =>
  t.total > 0 ? `${t.readCount} of ${t.total} read` : null;

// ---- Spotting one series spelled two ways (the librarians' series editor) -----------------------

// Looser than seriesSlug: a leading or trailing "The", "&" for "and", and a closing "series", "saga" or
// "trilogy" set aside too, so "Stormlight Archive, The", "The Stormlight Archive" and "Stormlight Archive
// Series" all come out "stormlight archive".
export function seriesLooseKey(name: string) {
  return squash(name.replace(/&/g, " and "))
    .replace(/^the /, "")
    .replace(/ the$/, "")
    .replace(/ (series|saga|trilogy|books|novels)$/, "")
    .trim();
}

// Other spellings in `names` that are possibly the same series as `name` (not `name` itself).
export const possiblySameSeries = (name: string, names: string[]) => {
  const key = seriesLooseKey(name);
  return key ? names.filter((n) => n !== name && seriesLooseKey(n) === key) : [];
};
