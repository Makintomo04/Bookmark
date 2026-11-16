import prisma from "@/lib/db";
import { normaliseWorkKey, sameBook, sameTitleAndAuthor } from "@/lib/workKey";

// A reader has one copy of a book: rereads are BookRead rows on it, and a shelf move edits it. Every
// add path (Discover's Want to read, the add-book modal, Start a circle) goes through POST /api/books,
// so that's where a second copy is turned away.

type Candidate = { title: string; author: string; workKey?: string | null; workId?: string | null };

export const SHELF_NAMES: Record<string, string> = {
  STARTED: "Currently reading",
  PAUSED: "Paused",
  NOT_STARTED: "Want to read",
  COMPLETED: "Finished",
  DNF: "Did not finish",
  NOT_INTERESTED: "Will not read",
};

// The reader's copies of this book, oldest first: same Open Library work, same catalogue Work, or
// (for a book without a key) the same title and author.
export async function shelfCopies(userId: string, book: Candidate) {
  const workKey = normaliseWorkKey(book.workKey);
  const rows = await prisma.book.findMany({
    where: {
      userId,
      OR: [
        ...(workKey ? [{ workKey }] : []),
        ...(book.workId ? [{ workId: book.workId }] : []),
        { title: { equals: book.title.trim(), mode: "insensitive" as const } },
      ],
    },
    select: { id: true, title: true, author: true, workKey: true, workId: true, status: true },
  });
  const wanted = { ...book, workKey };
  return rows
    .filter((b) => (book.workId && b.workId === book.workId) || sameBook(b, wanted))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export const alreadyShelved = (copy: { id: string; status: string }) => ({
  error: SHELF_NAMES[copy.status] ? `Already on your shelf, in ${SHELF_NAMES[copy.status]}` : "Already on your shelf",
  bookId: copy.id,
  status: copy.status,
});

// Each book's copy on the reader's shelf, in order: its id and shelf, or null. One read of the shelf's keys
// for the lot (a row of a page, not a library). Looser than shelfCopies: the same title and author counts
// even under another work key, since this only says "On your shelf" and opens their copy.
export async function shelfMatches(userId: string, books: Candidate[]) {
  if (books.length === 0) return [];
  const shelf = await prisma.book.findMany({ where: { userId }, select: { id: true, title: true, author: true, workKey: true, status: true } });
  return books.map((book) => {
    const wanted = { ...book, workKey: normaliseWorkKey(book.workKey) };
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
    const copy = shelf.filter((b) => sameBook(b, wanted)).sort(byId)[0] ?? shelf.filter((b) => sameTitleAndAuthor(b, wanted)).sort(byId)[0];
    return copy ? { bookId: copy.id, status: copy.status } : null;
  });
}
