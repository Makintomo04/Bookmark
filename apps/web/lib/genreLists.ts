import prisma from "@/lib/db"
import { findLists } from "@/lib/lists"
import { GENRE_LISTS_SHOWN, allGenreListsOrder, rankGenreLists } from "@/lib/genreListRules"

type Viewer = Parameters<typeof findLists>[1]

// How many times each list has been remixed (copied into someone else's lists).
async function remixCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map()
  const rows = await prisma.list.groupBy({ by: ["forkedFromId"], where: { forkedFromId: { in: ids } }, _count: { _all: true } })
  return new Map(rows.map((r) => [r.forkedFromId!, r._count._all]))
}

// Readers' lists for the top of a genre's page: editors' choices, then the best of the rest
// (lib/genreListRules.ts says how they're picked and ordered).
export async function genreCommunityLists(genre: string, viewer: Viewer, limit = GENRE_LISTS_SHOWN) {
  const [chosen, candidates] = await Promise.all([
    findLists({ community: true, genre, chosen: true, limit }, viewer),
    findLists({ community: true, genre, quality: true, limit: 50 }, viewer),
  ])
  return rankGenreLists(chosen, candidates, await remixCounts(candidates.map((l) => l.id)), limit)
}

// The genre's "All readers' lists" page.
export async function allGenreCommunityLists(genre: string, viewer: Viewer) {
  return allGenreListsOrder(await findLists({ community: true, genre, limit: 50 }, viewer))
}
