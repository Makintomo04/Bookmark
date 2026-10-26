import { cache } from "react"
import prisma from "./db"
import { workCover, workDescription, worksByKeys, type DiscoverBook } from "./openLibrary"
import { GENRES, type Genre } from "./genres"
import { genresFromSubjects } from "./import/genre"

// What a book page (app/(main)/books/[slug]) shows about the book itself. The shared catalog's Work
// comes first, since it's already cached and holds series; a book nobody on Bookmark has shelved yet
// falls back to Open Library. Cached per request, so the metadata and the page share one lookup.

const GENRES_SHOWN = 4

export interface BookPageData {
  book: DiscoverBook
  description: string | null
  genres: Genre[]
  series: { name: string, position: number | null } | null
  editionCount: number | null
}

// Open Library subjects run from "Fantasy" to "nyt:hardcover-fiction=2023-05-21" in several languages;
// the page shows the Bookmark genres they point at instead, each linking to its Discover shelf.
const genresOf = (subjects: string[]) =>
  genresFromSubjects(subjects).flatMap((label) => GENRES.filter((g) => g.label === label)).slice(0, GENRES_SHOWN)

export const bookPageData = cache(async (workKey: string): Promise<BookPageData | null> => {
  const work = await prisma.work.findFirst({
    where: { openLibraryKey: workKey },
    select: {
      title: true, authors: true, authorKeys: true, description: true, subjects: true, seriesName: true, seriesPosition: true,
      coverUrl: true, firstPublishYear: true, olEditionCount: true,
      editions: { select: { pages: true, coverUrl: true }, take: 20 },
    },
  })

  if (work) {
    const pages = work.editions.flatMap((e) => (e.pages ? [e.pages] : [])).sort((a, b) => a - b)
    // Not every catalog work has its own cover yet: an edition's will do, else Open Library's.
    const coverUrl = work.coverUrl
      ?? work.editions.find((e) => e.coverUrl)?.coverUrl
      ?? await workCover(workKey).catch(() => null)
    return {
      book: {
        workKey,
        title: work.title,
        author: work.authors[0] ?? "Unknown",
        pages: pages.length ? pages[Math.floor(pages.length / 2)] : null,
        coverUrl,
        year: work.firstPublishYear,
        authorKey: work.authorKeys[0] ?? null,
      },
      description: work.description ?? await workDescription(workKey).catch(() => null),
      genres: genresOf(work.subjects),
      series: work.seriesName ? { name: work.seriesName, position: work.seriesPosition } : null,
      editionCount: work.olEditionCount,
    }
  }

  const [found, description] = await Promise.all([
    worksByKeys([workKey]).catch(() => new Map()),
    workDescription(workKey).catch(() => null),
  ])
  const ol = found.get(workKey)
  if (!ol?.title) return null
  return {
    book: {
      workKey,
      title: ol.title,
      author: ol.authors[0] ?? "Unknown",
      pages: ol.pages,
      coverUrl: ol.coverUrl,
      year: ol.year,
      authorKey: ol.authorKeys[0] ?? null,
    },
    description,
    genres: genresOf(ol.subjects),
    series: null,
    editionCount: null,
  }
})
