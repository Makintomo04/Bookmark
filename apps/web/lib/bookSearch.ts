import { unstable_cache } from "next/cache"
import prisma from "@/lib/db"
import { searchBooks, type DiscoverBook } from "./openLibrary"
import { normaliseQuery, queryTokens, rankShelfRows } from "./bookSearchRules"

// Enough readers' copies to rank by popularity without reading the whole collection.
const SHELF_SCAN = 300
// Open Library's results for a query barely change; six hours keeps repeat searches instant.
const CATALOGUE_TTL = 6 * 60 * 60

// Books already on someone's shelf, matched across title and author ("piranesi clarke"). Only books with
// an Open Library work key: hand-typed ones may be private notes, and nothing about who shelved it leaves here.
export async function searchShelves(query: string, limit: number): Promise<DiscoverBook[]> {
  const tokens = queryTokens(query)
  if (tokens.length === 0) return []
  const rows = await prisma.book.findMany({
    where: {
      workKey: { not: null },
      AND: tokens.map((t) => ({
        OR: [
          { title: { contains: t, mode: "insensitive" as const } },
          { author: { contains: t, mode: "insensitive" as const } },
        ],
      })),
    },
    select: { workKey: true, title: true, author: true, pages: true, coverImage: true },
    take: SHELF_SCAN,
  })
  return rankShelfRows(rows, query, limit)
}

// A failed search throws, so it isn't cached and the next attempt tries Open Library again.
const cachedCatalogue = unstable_cache(
  (query: string, limit: number) => searchBooks(query, limit),
  ["open-library-search"],
  { revalidate: CATALOGUE_TTL },
)

export const searchCatalogue = (query: string, limit: number) => cachedCatalogue(normaliseQuery(query), limit)
