import { mutate } from "swr";
import { authorSlug } from "@bookmark/shared/authors";
import { api } from "@/lib/api";
import type { FoundBook } from "@/lib/useBookSearch";
import type { AuthorSeries } from "@/lib/series";

// Author pages and following authors (the web's /authors/<slug> and lib/authorFollows.ts).

export interface AuthorPage {
  author: { slug: string; name: string; key: string | null };
  about?: { photoUrl: string | null; bio: string[] };
  canFollow?: boolean;
  isFollowing?: boolean;
  // Their series in our catalog, on the first page.
  series?: AuthorSeries[];
  books: FoundBook[];
  nextOffset: number | null;
  failed: boolean;
  total: number | null;
}

export interface FollowedAuthor {
  key: string;
  name: string;
  slug: string;
  followedAt: string;
}

export const authorPageKey = (slug: string) => `/api/authors/${encodeURIComponent(slug)}`;
export const FOLLOWED_AUTHORS_KEY = "/api/user/authors";

export const authorPath = (name: string) => `/authors/${encodeURIComponent(authorSlug(name))}`;

// Sets the follow rather than toggling it, so retrying after a dropped connection can't undo it.
export async function setFollowingAuthor(slug: string, following: boolean) {
  const path = `${authorPageKey(slug)}/follow`;
  if (following) await api.put(path);
  else await api.delete(path);
  await Promise.all([mutate(authorPageKey(slug)), mutate(FOLLOWED_AUTHORS_KEY)]);
}
