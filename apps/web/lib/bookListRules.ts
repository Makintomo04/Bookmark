// Which readers' lists show on a book's page, and in what order. Pure, so
// scripts/test/bookLists.test.ts can check it; lib/bookLists.ts runs the queries.
//
//   1. Editors' choice: lists a librarian or admin chose (List.chosenAt), most recently chosen first.
//   2. Then the most remixed, the clearest sign other readers found a list useful.
//   3. Then the longest, since a bigger list says more about where the book sits, then newest first.
//
// The page shows the first few; the book's "See all" page shows every one in the same order.

export const BOOK_LISTS_SHOWN = 4

export interface RankableBookList {
  id: string
  updatedAt: Date | string
  chosenAt?: Date | string | null
  itemCount: number
}

const time = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : 0)

export function rankBookLists<L extends RankableBookList>(lists: L[], remixes: Map<string, number>, limit?: number): L[] {
  const ranked = [...lists].sort((a, b) =>
    Number(!!b.chosenAt) - Number(!!a.chosenAt)
    || time(b.chosenAt) - time(a.chosenAt)
    || (remixes.get(b.id) ?? 0) - (remixes.get(a.id) ?? 0)
    || b.itemCount - a.itemCount
    || time(b.updatedAt) - time(a.updatedAt))
  return limit == null ? ranked : ranked.slice(0, limit)
}
