import prisma from "@/lib/db";
import { hardcoverBook, hardcoverConfigured, hardcoverQuery, searchHardcover } from "@/lib/hardcover";
import { sameBook } from "@/lib/workKey";
import { sameBook as sameHit } from "@/lib/bookSearchRules";
import type { DiscoverBook } from "@/lib/openLibrary";

// Books like the one you've just finished, for the "Because you finished" row in the Update sheet. Hardcover keeps
// a ranked list of the books readers shelve alongside each one (`cached_similar_book_ids`, refreshed every few
// days), which is far closer to "if you liked this" than a genre list. Other books by the same author go first.
// Server-only, and three small Hardcover requests the first time (find the book, read its list, fetch the
// details), so each answer is kept for a day. Supporter plan: 50,000 requests a day.
export const SIMILAR_LIMIT = 3;
// Fewer than this and the row isn't shown: two or three real matches or nothing, never a filler list.
export const SIMILAR_MIN = 2;
// How far down Hardcover's list to look, since your shelf and the book's own series thin it out.
const LOOK_AT = 24;
// A book other readers barely shelve is a poor suggestion, however it ranks.
const MIN_READERS = 300;

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : []);

interface HcBook {
  id: number; title: string; pages: number | null; release_year: number | null; users_count: number | null
  description: string | null; headline: string | null; image: { url?: string | null } | null
  cached_contributors: { author?: { name?: string } }[] | null
  featured_book_series: { series?: { id?: number } | null } | null
}

const DETAILS = `fragment B on books { id title pages release_year users_count description headline image { url } cached_contributors featured_book_series { series { id } } }`;
const SIMILAR_IDS = `query Similar($id: Int!) { books(where: { id: { _eq: $id } }) { cached_similar_book_ids featured_book_series { series { id } } } }`;
const FETCH = `${DETAILS}
query Fetch($ids: [Int!]!, $author: String!) {
  similar: books(where: { id: { _in: $ids }, canonical_id: { _is_null: true } }) { ...B }
  byAuthor: books(where: { contributions: { author: { name: { _eq: $author } } }, canonical_id: { _is_null: true }, users_count: { _gte: ${MIN_READERS} } }, order_by: { users_count: desc }, limit: 8) { ...B }
}`;

const toDiscover = (b: HcBook) => hardcoverBook({
  id: b.id, title: b.title, author_names: (b.cached_contributors ?? []).map((c) => c.author?.name ?? ""), image: b.image,
  release_year: b.release_year, pages: b.pages, description: b.description, headline: b.headline,
});

const kept = new Map<string, { at: number; books: DiscoverBook[] }>();
const KEEP_MS = 24 * 60 * 60 * 1000;

// Up to SIMILAR_LIMIT books like `title` by `author` that aren't on the shelf, or [] when there aren't enough
// good ones (or Hardcover can't be reached: this row is a bonus, never an error).
export async function similarBooks(userId: string, title: string, author: string): Promise<DiscoverBook[]> {
  if (!hardcoverConfigured()) return [];
  const key = `${title}|${author}`.toLowerCase();
  let candidates = kept.get(key);
  if (!candidates || Date.now() - candidates.at > KEEP_MS) {
    candidates = { at: Date.now(), books: await candidatesFor(title, author).catch(() => [] as DiscoverBook[]) };
    // A failed lookup isn't kept, so the next finish tries again.
    if (candidates.books.length) kept.set(key, candidates);
  }
  if (!candidates.books.length) return [];
  const shelf = await prisma.book.findMany({ where: { userId }, select: { title: true, author: true, workKey: true } });
  const picks = candidates.books.filter((b) => !shelf.some((s) => sameBook(s, b))).slice(0, SIMILAR_LIMIT);
  return picks.length >= SIMILAR_MIN ? picks : [];
}

async function candidatesFor(title: string, author: string): Promise<DiscoverBook[]> {
  const found = sameHit({ title, author }, await searchHardcover(`${title} ${author}`, 5));
  const id = Number(found?.hardcoverId);
  if (!id) return [];
  const own = (await hardcoverQuery(SIMILAR_IDS, { id }))?.books?.[0];
  const list = ids(own?.cached_similar_book_ids).filter((n) => n !== id).slice(0, LOOK_AT);
  if (!list.length) return [];
  const seriesId: number | undefined = own?.featured_book_series?.series?.id;
  const data = await hardcoverQuery(FETCH, { ids: list, author: found?.author ?? author });
  const rank = new Map(list.map((n, i) => [n, i]));
  const similar = ((data?.similar ?? []) as HcBook[]).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  // The finished book's own series is the series row's job; its other books aren't "like" it.
  const fresh = (b: HcBook) => b.id !== id && (!seriesId || b.featured_book_series?.series?.id !== seriesId)
    && (b.users_count ?? 0) >= MIN_READERS && !!b.image?.url;
  // Another book by the same author leads, then the readers' list. One per author so it doesn't read as a bibliography.
  const byAuthor = ((data?.byAuthor ?? []) as HcBook[]).filter(fresh).slice(0, 1);
  const out: DiscoverBook[] = [];
  const authors = new Set<string>();
  for (const b of [...byAuthor, ...similar.filter(fresh)]) {
    const book = toDiscover(b);
    if (!book || out.some((o) => o.hardcoverId === book.hardcoverId)) continue;
    const a = book.author.toLowerCase();
    if (authors.has(a) && !byAuthor.includes(b)) continue;
    authors.add(a);
    out.push(book);
  }
  return out;
}
