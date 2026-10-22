import { normaliseWorkKey } from "../workKey.ts";
import { genreFromSubjects } from "./genre.ts";
import { stripSeries } from "./formats.ts";
import { type ImportCandidate, type ImportMatch, type ImportRow, type MatchEntry, asMatch, isUncertain } from "./types.ts";

// Matches import rows to Open Library works: by ISBN-13, then ISBN-10, then title + author.
// ISBNs go many to a request (`isbn:a OR isbn:b …`), so a 2,000-book Goodreads library takes a few
// dozen requests rather than thousands; only rows without a usable ISBN need a search each.
//
// Every match carries a confidence. An ISBN hit whose title doesn't look like the row's (an audiobook
// ISBN Open Library has filed under another book, say) is kept but marked uncertain, and the works the
// title search turned up are kept as candidates for the model (lib/import/llmMatch.ts) and the reader.
//
// Kept free of "@/" imports so scripts/test/import.test.ts can run it against a stubbed fetch.

// What an ISBN hit scores when the title doesn't agree with the row's: shown to the reader, not filed as is.
export const DOUBTFUL = 0.5;
// How many works are kept for a row nothing matched.
export const CANDIDATES_KEPT = 3;
const CANDIDATE_SUBJECTS = 12;

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status?: number; json(): Promise<any> }>;

interface Doc {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  first_publish_year?: number;
  isbn?: string[];
  subject?: string[];
}

const SEARCH = "https://openlibrary.org/search.json";
const FIELDS = "key,title,author_name,cover_i,number_of_pages_median,first_publish_year,subject";
// Open Library lists a hundred-odd subjects for a popular work; the catalog keeps the first few.
const SUBJECTS_KEPT = 30;
export const ISBNS_PER_REQUEST = 25;
const TIMEOUT_MS = 6000;

const coverUrl = (id?: number) => (id ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : null);

function toMatch(doc: Doc, by: ImportMatch["by"]): ImportMatch | null {
  const workKey = normaliseWorkKey(doc.key);
  if (!workKey) return null;
  return {
    workKey,
    coverUrl: coverUrl(doc.cover_i),
    pages: doc.number_of_pages_median || null,
    genre: genreFromSubjects(doc.subject),
    by,
    title: doc.title || null,
    authors: doc.author_name ?? [],
    subjects: (doc.subject ?? []).slice(0, SUBJECTS_KEPT),
    year: doc.first_publish_year || null,
  };
}

export function toCandidate(doc: Doc): ImportCandidate | null {
  const workKey = normaliseWorkKey(doc.key);
  if (!workKey) return null;
  return {
    workKey,
    title: doc.title || null,
    authors: doc.author_name ?? [],
    year: doc.first_publish_year || null,
    coverUrl: coverUrl(doc.cover_i),
    pages: doc.number_of_pages_median || null,
    subjects: (doc.subject ?? []).slice(0, CANDIDATE_SUBJECTS),
  };
}

// A candidate the model or the reader chose, as the match the row files under.
export function candidateToMatch(c: ImportCandidate, by: ImportMatch["by"], confidence: number, candidates?: ImportCandidate[]): ImportMatch {
  return {
    workKey: c.workKey,
    coverUrl: c.coverUrl,
    pages: c.pages,
    genre: genreFromSubjects(c.subjects),
    by,
    title: c.title,
    authors: c.authors,
    subjects: c.subjects,
    year: c.year,
    confidence,
    ...(by === "reader" && { reviewed: true }),
    ...(candidates && { candidates: candidates.filter((o) => o.workKey !== c.workKey) }),
  };
}

async function search(fetchImpl: Fetch, params: Record<string, string>): Promise<Doc[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetchImpl(`${SEARCH}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Open Library search failed with ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.docs) ? data.docs : [];
}

// One request for up to ISBNS_PER_REQUEST ISBNs. Each work lists every edition's ISBN, which is how
// a result is tied back to the ISBN that found it.
export async function matchIsbns(isbns: string[], fetchImpl: Fetch = fetch as unknown as Fetch): Promise<Map<string, Doc>> {
  const found = new Map<string, Doc>();
  if (isbns.length === 0) return found;
  const docs = await search(fetchImpl, {
    q: isbns.map((i) => `isbn:${i}`).join(" OR "),
    fields: `${FIELDS},isbn`,
    limit: String(isbns.length * 2),
  });
  const wanted = new Set(isbns);
  for (const doc of docs) {
    for (const isbn of doc.isbn ?? []) {
      if (wanted.has(isbn) && !found.has(isbn)) found.set(isbn, doc);
    }
  }
  return found;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
// "Dune: Deluxe Edition" and "Dune" are the same book for matching purposes.
const mainTitle = (s: string) => stripSeries(s).split(/[:;]/)[0];

// Lower case, no leading article, single spaces: "The  Hobbit" → "hobbit".
const loose = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().replace(/^(the|a|an) /, "");

// "the hobbit, or there and back again" starts with "the hobbit" and then a separator, so it's the same
// book; "dune messiah" starts with "dune" and then more title, so it isn't.
function sameTitle(x: string, y: string) {
  const [a, b] = [loose(x), loose(y)];
  if (!a || !b) return false;
  if (norm(a) === norm(b)) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short) && /^\s*[,:;(\-–—]/.test(long.slice(short.length));
}

// Search ranks loosely, so the top hit must actually be this book: the same main title (allowing an
// article or a subtitle more or less) and an author surname in common.
export function plausibleMatch(row: Pick<ImportRow, "title" | "author">, doc: Doc) {
  if (!sameTitle(mainTitle(row.title), mainTitle(doc.title ?? "")) && !sameTitle(row.title, doc.title ?? "")) return false;
  const surname = norm(row.author.trim().split(/\s+/).pop() ?? "");
  if (!surname || row.author === "Unknown") return true;
  return (doc.author_name ?? []).some((name) => norm(name).includes(surname));
}

export interface TitleSearch {
  // A plausible hit, confident.
  match: ImportMatch | null;
  // What the search returned (the match first, if any), for the model and the reader to choose from.
  candidates: ImportCandidate[];
}

// Title + author search. When the author filter finds nothing (a misspelt or inverted author), one
// free-text search for the title and author together; those hits are only ever candidates.
export async function searchTitle(row: Pick<ImportRow, "title" | "author">, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<TitleSearch> {
  const title = mainTitle(row.title).trim();
  if (!title) return { match: null, candidates: [] };
  const hasAuthor = !!row.author && row.author !== "Unknown";
  const params: Record<string, string> = { title, fields: FIELDS, limit: String(CANDIDATES_KEPT) };
  if (hasAuthor) params.author = row.author;
  let docs = await search(fetchImpl, params);
  let doc = docs.find((d) => plausibleMatch(row, d));
  if (docs.length === 0 && hasAuthor) {
    docs = await search(fetchImpl, { q: `${title} ${row.author}`, fields: FIELDS, limit: String(CANDIDATES_KEPT) });
    doc = undefined;
  }
  const candidates = docs.map(toCandidate).filter((c): c is ImportCandidate => !!c).slice(0, CANDIDATES_KEPT);
  const match = doc ? toMatch(doc, "title") : null;
  if (match) candidates.sort((a, b) => Number(b.workKey === match.workKey) - Number(a.workKey === match.workKey));
  return { match, candidates };
}

export async function matchTitle(row: Pick<ImportRow, "title" | "author">, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<ImportMatch | null> {
  return (await searchTitle(row, fetchImpl)).match;
}

// Runs `worker` over items with at most `limit` in flight, stopping new work once `deadline` passes.
// Returns how many items were handed out, in order, so the caller can resume from there.
export async function runPool<T>(items: T[], limit: number, deadline: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && Date.now() < deadline) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return next;
}

export interface MatchBatchResult {
  // Index → match, no-match with candidates, or null (nothing found at all). Only rows that were attempted are present.
  matches: Map<number, MatchEntry>;
  // Rows whose lookup failed (timeout, Open Library down); left unmatched rather than retried forever.
  // Rows the deadline cut off are missing from `matches`, so the caller looks them up next time.
  failed: number;
}

// Matches `indexes` of `rows`: ISBN batches first (in parallel), then a title search for whatever's left.
// Stops starting new title searches at `deadline` and leaves those rows out, so the caller resumes them.
export async function matchRows(
  rows: ImportRow[],
  indexes: number[],
  opts: { deadline: number; concurrency?: number; fetchImpl?: Fetch }
): Promise<MatchBatchResult> {
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as Fetch);
  const matches = new Map<number, MatchEntry>();
  let failed = 0;

  const isbns = new Set<string>();
  for (const i of indexes) {
    const r = rows[i];
    if (r.isbn13) isbns.add(r.isbn13);
    if (r.isbn10) isbns.add(r.isbn10);
  }
  const chunks: string[][] = [];
  const all = Array.from(isbns);
  for (let i = 0; i < all.length; i += ISBNS_PER_REQUEST) chunks.push(all.slice(i, i + ISBNS_PER_REQUEST));

  const byIsbn = new Map<string, Doc>();
  await Promise.all(
    chunks.map((chunk) =>
      matchIsbns(chunk, fetchImpl)
        .then((found) => found.forEach((doc, isbn) => byIsbn.set(isbn, doc)))
        // A failed ISBN batch falls through to title search below.
        .catch(() => undefined)
    )
  );

  const needTitle: number[] = [];
  for (const i of indexes) {
    const r = rows[i];
    const doc13 = r.isbn13 ? byIsbn.get(r.isbn13) : undefined;
    const doc10 = r.isbn10 ? byIsbn.get(r.isbn10) : undefined;
    const doc = doc13 ?? doc10;
    const match = doc13 ? toMatch(doc13, "isbn13") : doc10 ? toMatch(doc10, "isbn") : null;
    if (match && doc) {
      // An ISBN that Open Library files under a book with another title is a doubtful match (an
      // audiobook or ebook ISBN mis-filed, or a boxed set), to be checked rather than filed as is.
      if (plausibleMatch(r, doc)) match.confidence = 1;
      else {
        match.confidence = DOUBTFUL;
        match.isbnDoubtful = true;
      }
      matches.set(i, match);
    }
    // Open Library has stray one-edition works with no cover; a title search often finds the main one,
    // and a doubtful ISBN hit needs the title search's works as the alternatives to offer.
    if (!match || !match.coverUrl || isUncertain(match)) needTitle.push(i);
  }

  await runPool(needTitle, opts.concurrency ?? 6, opts.deadline, async (i) => {
    const byIsbn = asMatch(matches.get(i));
    try {
      const { match: byTitle, candidates } = await searchTitle(rows[i], fetchImpl);
      if (byTitle) {
        byTitle.confidence = 1;
        // The ISBN points at another book: the title hit is the match, and the ISBN stays out of the catalog.
        if (byIsbn?.isbnDoubtful && byIsbn.workKey !== byTitle.workKey) byTitle.isbnDoubtful = true;
        // A plausible title hit outranks a doubtful ISBN hit, and a cover outranks none.
        const keep = !byIsbn || isUncertain(byIsbn) || byTitle.coverUrl ? byTitle : byIsbn;
        matches.set(i, keep);
      } else if (byIsbn) {
        if (isUncertain(byIsbn) && candidates.length) byIsbn.candidates = candidates.filter((c) => c.workKey !== byIsbn.workKey);
        matches.set(i, byIsbn);
      } else {
        matches.set(i, candidates.length ? { workKey: null, candidates } : null);
      }
    } catch {
      if (!byIsbn) failed++;
      matches.set(i, byIsbn);
    }
  });

  return { matches, failed };
}
