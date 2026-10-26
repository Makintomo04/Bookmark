// Which readers' lists lead a genre's page on Discover, and in what order. Pure, so
// scripts/test/genreLists.test.ts can check it; lib/genreLists.ts runs the queries.
//
//   1. Editors' choice: lists a librarian or admin chose (List.chosenAt), most recently chosen first.
//   2. The rest of the spaces go to lists that clear a quality bar (qualifies() below), ranked by how
//      many times they've been remixed, the clearest sign other readers found them useful, then newest
//      first so the row doesn't freeze.
//
// Everything else is still on the genre's "All readers' lists" page.

export const GENRE_LISTS_SHOWN = 8
export const QUALITY_MIN_BOOKS = 5
export const QUALITY_MIN_ACCOUNT_DAYS = 7

export interface RankableList {
  id: string
  createdAt: Date | string
  chosenAt?: Date | string | null
  itemCount: number
  description?: string | null
}

const time = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : 0)

// The bar a list clears to be picked automatically. Open reports and the owner's account age are
// checked in the query (lib/genreLists.ts), since they need other tables.
export function qualifies(list: RankableList): boolean {
  return list.itemCount >= QUALITY_MIN_BOOKS && !!list.description?.trim()
}

export function rankGenreLists<L extends RankableList>(chosen: L[], candidates: L[], remixes: Map<string, number>, limit = GENRE_LISTS_SHOWN): L[] {
  const picked = [...chosen].sort((a, b) => time(b.chosenAt) - time(a.chosenAt)).slice(0, limit)
  const taken = new Set(picked.map((l) => l.id))
  const rest = candidates
    .filter((l) => !taken.has(l.id) && qualifies(l))
    .sort((a, b) => (remixes.get(b.id) ?? 0) - (remixes.get(a.id) ?? 0) || time(b.createdAt) - time(a.createdAt))
  return [...picked, ...rest].slice(0, limit)
}

// The "All readers' lists" page: editors' choices first, then everything else newest first.
export function allGenreListsOrder<L extends RankableList & { updatedAt: Date | string }>(lists: L[]): L[] {
  return [...lists].sort((a, b) => Number(!!b.chosenAt) - Number(!!a.chosenAt) || time(b.chosenAt) - time(a.chosenAt) || time(b.updatedAt) - time(a.updatedAt))
}
