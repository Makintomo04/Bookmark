import prisma from "@/lib/db";
import { GENRES } from "@/lib/genres";
import { subjectBooks, type DiscoverBook } from "@/lib/openLibrary";
import { sameBook } from "@/lib/workKey";

// The most-shelved books in up to this many of your favourite genres, taken in turn so one genre
// doesn't fill the row. Each genre offers a deeper pool than the row needs, since one book per author
// (below) and your own shelf both thin it out.
const MAX_GENRES = 4;
const PER_GENRE = 24;
export const GENRE_PICKS_LIMIT = 12;

// Open Library subjects for explicit or dark books. Nobody gets these in suggestions they didn't ask for:
// they're left out unless the reader picked Dark Romance, which says they want them. Search, genre pages
// and Ask the shelf still show everything.
const MATURE_SUBJECTS = ["dark_romance", "erotica", "erotic_literature", "erotic_fiction", "fiction_erotica_general", "sexual_abuse", "bdsm"];
const OPTS_IN_TO_MATURE = "dark-romance";

// Works the subject filter misses, by Open Library work key. Add one whenever a suggestion turns out wrong.
const BLOCKED_WORKS = new Set([
  "OL27245843W", // Twisted Hate (Ana Huang): explicit, but untagged unlike the rest of its series
  "OL17864836W", // Cadáver exquisito (Tender Is the Flesh): graphic, and the work's title is in Spanish
  "OL10263W", // Le petit prince: the work's title is in French, so it reads as a foreign edition
]);

export interface GenrePicks {
  genres: { slug: string; label: string }[];
  books: DiscoverBook[];
}

// The genre picks: books other readers shelve most in the genres you said you love, minus
// anything already on your shelf. A plain popularity list, not a judgement about you, so it's the same
// for everyone with the same genres. Open Library results are cached for a day (lib/openLibrary.ts).
export async function genrePicks(userId: string, favGenres: string[]): Promise<GenrePicks> {
  const genres = GENRES.filter((g) => favGenres.includes(g.slug)).slice(0, MAX_GENRES);
  if (genres.length === 0) return { genres: [], books: [] };
  const exclude = favGenres.includes(OPTS_IN_TO_MATURE) ? [] : MATURE_SUBJECTS;

  const [results, shelf] = await Promise.all([
    Promise.all(genres.map((g) => subjectBooks(g.subject, 0, PER_GENRE, exclude).catch(() => [] as DiscoverBook[]))),
    prisma.book.findMany({ where: { userId }, select: { title: true, author: true, workKey: true } }),
  ]);

  const books: DiscoverBook[] = [];
  // One book per author: four Stephen Kings in a row reads as a list nobody chose.
  const authors = new Set<string>();
  const authorOf = (b: DiscoverBook) => b.author.trim().toLowerCase();
  for (let i = 0; i < PER_GENRE && books.length < GENRE_PICKS_LIMIT; i++) {
    for (const list of results) {
      const book = list[i];
      if (!book || books.length >= GENRE_PICKS_LIMIT || (book.workKey && BLOCKED_WORKS.has(book.workKey))) continue;
      // A book can sit in several genres; and anything on your shelf, whatever its status, is already known to you.
      if (authors.has(authorOf(book)) || books.some((b) => sameBook(b, book)) || shelf.some((s) => sameBook(s, book))) continue;
      authors.add(authorOf(book));
      books.push(book);
    }
  }
  return { genres: genres.map(({ slug, label }) => ({ slug, label })), books };
}
