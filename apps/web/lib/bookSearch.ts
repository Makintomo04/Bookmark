import { unstable_cache } from "next/cache"
import prisma from "@/lib/db"
import { searchBooks, type DiscoverBook } from "./openLibrary"
import { hardcoverConfigured, searchHardcover } from "./hardcover"
import { needsFallback, normaliseQuery, queryTokens, rankShelfRows, withFallback } from "./bookSearchRules"
import { isShareableCover } from "./uploadedImages"
import { uploadersOf } from "./uploads"

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
  // Results are shared, so a cover readers uploaded for their own copies is left out (lib/uploads.ts).
  const uploaders = await uploadersOf(rows.map((r) => r.coverImage))
  const shareable = uploaders.size ? rows.map((r) => (isShareableCover(r.coverImage, uploaders, null) ? r : { ...r, coverImage: "" })) : rows
  return rankShelfRows(shareable, query, limit)
}

// A failed search throws, so it isn't cached and the next attempt tries Open Library again.
const cachedCatalogue = unstable_cache(
  (query: string, limit: number) => searchBooks(query, limit),
  ["open-library-search"],
  { revalidate: CATALOGUE_TTL },
)

// Hardcover's results barely change either, and its free plan allows 5,000 requests a day.
const cachedHardcover = unstable_cache(
  (query: string, limit: number) => searchHardcover(query, limit),
  ["hardcover-search"],
  { revalidate: CATALOGUE_TTL },
)

// Open Library first. When it has nothing, or nothing that matches every word, Hardcover fills in: it has
// the indie and Kindle-only books Open Library misses, and stands in when Open Library is down. Hardcover
// failing (or no token set) never fails the search; it just isn't added.
export async function searchCatalogue(query: string, limit: number) {
  const q = normaliseQuery(query)
  const hardcover = () => cachedHardcover(q, limit).catch((err) => {
    console.warn("Hardcover search failed", err instanceof Error ? err.message : err)
    return null
  })
  let openLibrary: DiscoverBook[]
  try {
    openLibrary = await cachedCatalogue(q, limit)
  } catch (err) {
    // Throwing tells the search route Open Library is down, unless Hardcover can answer instead.
    const standIn = hardcoverConfigured() ? await hardcover() : null
    if (standIn?.length) return standIn
    throw err
  }
  if (!hardcoverConfigured() || !needsFallback(openLibrary, q)) return openLibrary
  return withFallback(openLibrary, (await hardcover()) ?? [], limit)
}
