import { router } from "expo-router";
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

// Opens Add a book on this book, ready to choose a shelf.
export function addBook(book: { title: string; author: string; coverUrl?: string | null; pages?: number | null; workKey?: string | null }) {
  const params = new URLSearchParams({ title: book.title, author: book.author });
  if (book.coverUrl) params.set("coverUrl", book.coverUrl);
  if (book.pages) params.set("pages", String(book.pages));
  if (book.workKey) params.set("workKey", book.workKey);
  router.push(`/add-book?${params.toString()}` as never);
}
