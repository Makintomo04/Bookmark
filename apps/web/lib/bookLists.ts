import { findLists } from "@/lib/lists"
import { remixCounts } from "@/lib/genreLists"
import { rankBookLists } from "@/lib/bookListRules"

type Viewer = Parameters<typeof findLists>[1]

// Readers' public lists with this book on them, best first (lib/bookListRules.ts says how they're
// ordered). Without a limit, every one the viewer may see, for the book's "See all" page. Lists find
// their books by Open Library work key, so a book without one is on none.
export async function listsWithBook(workKey: string | null, viewer: Viewer, limit?: number) {
  if (!workKey) return []
  const lists = await findLists({ community: true, workKey, limit: 50 }, viewer)
  return rankBookLists(lists, await remixCounts(lists.map((l) => l.id)), limit)
}
