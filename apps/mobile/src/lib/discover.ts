import { router } from "expo-router";
import useSWR from "swr";
import { api } from "@/lib/api";
import type { Person } from "@/lib/social";
import type { FoundBook } from "@/lib/useBookSearch";

// Discover's lists and picks, as the API serves them (the web's lib/lists.ts summaries).

export interface ListSummary {
  id: string;
  title: string;
  description: string | null;
  featuredLabel?: string | null;
  isPick: boolean;
  owner: Person;
  items: { title: string; author: string; coverUrl: string | null }[];
  itemCount: number;
}

export interface FollowingPick {
  key: string;
  book: FoundBook;
  person: Person;
  reason: string | null;
  rating: number | null;
  list: { id: string; title: string } | null;
}

export interface DiscoverHome {
  featured: ListSummary | null;
  genres: { slug: string; label: string }[];
  following: { followsAnyone: boolean; picks: FollowingPick[] };
  picks: ListSummary[];
  community: ListSummary[];
}

// The reader's copy of a book shown on a page, if they have one: its id and shelf.
export type ShelfCopy = { bookId: string; status: string } | null;
type Shelvable = { title: string; author: string; workKey?: string | null };
const ON_SHELF_MAX = 200;

// Which of a row of books the reader already has (POST /api/books/on-shelf), so a tile says "On your shelf"
// and opens their copy instead of offering Add. The key starts /api/books, so any book save refreshes it.
export function useOnShelf(books: Shelvable[] | undefined): (index: number) => ShelfCopy {
  const asked = (books ?? []).slice(0, ON_SHELF_MAX).map((b) => ({ title: b.title, author: b.author, workKey: b.workKey ?? null }));
  const body = JSON.stringify({ books: asked });
  const { data } = useSWR(asked.length ? `/api/books/on-shelf?for=${encodeURIComponent(body)}` : null, () => api.post<{ books: ShelfCopy[] }>("/api/books/on-shelf", { books: asked }));
  return (index) => data?.books[index] ?? null;
}

// A book tile's press: the reader's copy if they have it, else Add a book.
export function openOrAdd(book: Shelvable & { coverUrl?: string | null; pages?: number | null }, copy: ShelfCopy) {
  if (copy) router.push(`/book/${copy.bookId}` as never);
  else addBook(book);
}

// The end of a tile's label for screen readers: what pressing it does.
export const tileAction = (copy: ShelfCopy) => (copy ? "On your shelf. Open it." : "Add it.");

// Opens Add a book on this book, ready to choose a shelf (`shelf` picks which one starts selected).
export function addBook(book: { title: string; author: string; coverUrl?: string | null; pages?: number | null; workKey?: string | null }, shelf?: "STARTED" | "NOT_STARTED") {
  const params = new URLSearchParams({ title: book.title, author: book.author });
  if (shelf) params.set("shelf", shelf);
  if (book.coverUrl) params.set("coverUrl", book.coverUrl);
  if (book.pages) params.set("pages", String(book.pages));
  if (book.workKey) params.set("workKey", book.workKey);
  router.push(`/add-book?${params.toString()}` as never);
}
