import { normaliseWorkKey } from "../workKey.ts";
import { genreFromSubjects } from "./genre.ts";
import { stripSeries } from "./formats.ts";
import type { ImportMatch, ImportRow } from "./types.ts";

// Matches import rows to Open Library works: by ISBN-13, then ISBN-10, then title + author.
// ISBNs go many to a request (`isbn:a OR isbn:b …`), so a 2,000-book Goodreads library takes a few
// dozen requests rather than thousands; only rows without a usable ISBN need a search each.
//
// Kept free of "@/" imports so scripts/test/import.test.ts can run it against a stubbed fetch.

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

export async function matchTitle(row: Pick<ImportRow, "title" | "author">, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<ImportMatch | null> {
  const title = mainTitle(row.title).trim();
  if (!title) return null;
  const params: Record<string, string> = { title, fields: FIELDS, limit: "3" };
  if (row.author && row.author !== "Unknown") params.author = row.author;
  const docs = await search(fetchImpl, params);
  const doc = docs.find((d) => plausibleMatch(row, d));
  return doc ? toMatch(doc, "title") : null;
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
  // Index → match (null: nothing found). Only rows that were attempted are present.
  matches: Map<number, ImportMatch | null>;
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
  const matches = new Map<number, ImportMatch | null>();
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
    const match = doc13 ? toMatch(doc13, "isbn13") : doc10 ? toMatch(doc10, "isbn") : null;
    if (match) matches.set(i, match);
    // Open Library has stray one-edition works with no cover; a title search often finds the main one.
    if (!match?.coverUrl) needTitle.push(i);
  }

  await runPool(needTitle, opts.concurrency ?? 6, opts.deadline, async (i) => {
    const byIsbn = matches.get(i) ?? null;
    try {
      const byTitle = await matchTitle(rows[i], fetchImpl);
      matches.set(i, byTitle && (byTitle.coverUrl || !byIsbn) ? byTitle : byIsbn);
    } catch {
      if (!byIsbn) failed++;
      matches.set(i, byIsbn);
    }
  });

  return { matches, failed };
}
