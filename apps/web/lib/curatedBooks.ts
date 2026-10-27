import prisma from "@/lib/db";
import type { DiscoverBook } from "@/lib/openLibrary";

// Open Library lists (genre trending, genre picks) show Open Library's own title, author and cover. A
// librarian's correction to our catalogue (lib/catalogueFix.ts) wins over those, as it does on book pages
// and readers' copies, so a fixed title doesn't come back on the discover pages. One query per list.
export async function withCatalogueFixes(books: DiscoverBook[]): Promise<DiscoverBook[]> {
  const keys = Array.from(new Set(books.flatMap((b) => (b.workKey ? [b.workKey] : []))));
  if (!keys.length) return books;
  const works = await prisma.work.findMany({
    where: { openLibraryKey: { in: keys }, curatedFields: { isEmpty: false } },
    select: { openLibraryKey: true, title: true, authors: true, coverUrl: true, curatedFields: true },
  });
  if (!works.length) return books;
  const byKey = new Map(works.map((w) => [w.openLibraryKey, w]));
  return books.map((book) => {
    const work = book.workKey ? byKey.get(book.workKey) : undefined;
    if (!work) return book;
    const curated = new Set(work.curatedFields);
    return {
      ...book,
      ...(curated.has("title") && { title: work.title }),
      ...(curated.has("authors") && work.authors[0] && { author: work.authors[0] }),
      ...(curated.has("coverUrl") && work.coverUrl && { coverUrl: work.coverUrl }),
    };
  });
}

// For callers that already fall back to an empty list: a database hiccup shows Open Library's version.
export const withCatalogueFixesOrAsIs = (books: DiscoverBook[]) => withCatalogueFixes(books).catch(() => books);
