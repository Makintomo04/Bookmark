import { unstable_cache } from "next/cache"
import prisma from "@/lib/db"
import { searchBooks, type DiscoverBook } from "./openLibrary"
import { hardcoverConfigured, searchHardcover } from "./hardcover"
import { needsFallback, normaliseQuery, queryTokens, rankShelfRows, withFallback } from "./bookSearchRules"
import { isShareableCover } from "./uploadedImages"
import { uploadersOf } from "./uploads"
import { sharedBookWhere } from "./privacy"
import { hasPageWhere } from "./workPages"

// Enough readers' copies to rank by popularity without reading the whole collection.
const SHELF_SCAN = 300
// Open Library's results for a query barely change; six hours keeps repeat searches instant.
const CATALOGUE_TTL = 6 * 60 * 60

// Books already on someone's shelf, matched across title and author ("piranesi clarke"). Books with an Open
// Library work key, and books without one whose catalogue Work has a page (one added from Hardcover,
// lib/workPages.ts). Hand-typed ones may be private notes, so they never show, and nothing about who
// shelved a book leaves here.
export async function searchShelves(query: string, limit: number): Promise<DiscoverBook[]> {
  const tokens = queryTokens(query)
  if (tokens.length === 0) return []
  const matches = tokens.map((t) => ({
    OR: [
      { title: { contains: t, mode: "insensitive" as const } },
      { author: { contains: t, mode: "insensitive" as const } },
    ],
  }))
  const [keyed, keyless] = await Promise.all([
    prisma.book.findMany({
      where: { workKey: { not: null }, AND: matches },
      select: { workKey: true, title: true, author: true, pages: true, coverImage: true },
      take: SHELF_SCAN,
    }),
    // Only shared copies: a private one shouldn't even say a matching work exists.
    prisma.book.findMany({
      where: { workKey: null, workId: { not: null }, AND: [...matches, sharedBookWhere] },
      select: { workId: true, pages: true, coverImage: true },
      take: SHELF_SCAN,
    }),
  ])
  // A keyless copy shows as its catalogue Work, not as the reader typed or edited it.
  const works = keyless.length
    ? await prisma.work.findMany({
        where: { id: { in: Array.from(new Set(keyless.map((r) => r.workId!))) }, ...hasPageWhere },
        select: { id: true, openLibraryKey: true, title: true, authors: true, coverUrl: true },
      })
    : []
  const workById = new Map(works.map((w) => [w.id, w]))
  const rows = [
    ...keyed,
    ...keyless.flatMap((r) => {
      const work = workById.get(r.workId!)
      if (!work) return []
      return [{
        workKey: work.openLibraryKey,
        pageWorkId: work.id,
        title: work.title,
        author: work.authors[0] ?? "Unknown",
        pages: r.pages,
        coverImage: work.coverUrl ?? r.coverImage,
      }]
    }),
  ]
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
    if (standIn?.length) return withPages(standIn)
    throw err
  }
  if (!hardcoverConfigured() || !needsFallback(openLibrary, q)) return openLibrary
  return withPages(withFallback(openLibrary, (await hardcover()) ?? [], limit))
}

// A Hardcover hit someone has already shelved is in the catalogue under its Hardcover id, so it can link
// to its book page. One that isn't has no page yet: looking at it doesn't file it.
async function withPages(books: DiscoverBook[]): Promise<DiscoverBook[]> {
  const ids = books.flatMap((b) => (!b.workKey && b.hardcoverId ? [b.hardcoverId] : []))
  if (ids.length === 0) return books
  const works = await prisma.work.findMany({ where: { hardcoverId: { in: ids } }, select: { id: true, hardcoverId: true } })
    .catch(() => [])
  const byHardcoverId = new Map(works.map((w) => [w.hardcoverId, w.id]))
  return books.map((b) => (b.hardcoverId && byHardcoverId.has(b.hardcoverId) ? { ...b, pageWorkId: byHardcoverId.get(b.hardcoverId) } : b))
}
