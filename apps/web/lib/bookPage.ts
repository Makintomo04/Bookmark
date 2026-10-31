import { cache } from "react"
import prisma from "./db"
import { workCover, workDescription, worksByKeys, type DiscoverBook } from "./openLibrary"
import { GENRES, type Genre } from "./genres"
import { genresFromSubjects } from "./import/genre"
import { normaliseWorkKey } from "./workKey"
import { hasPageWhere } from "./workPages"
import { hardcoverRecord } from "./bookSearch"
import { topUp } from "./bookSearchRules"
import { librarianCover } from "./catalogueFixRules"
import { MERGED_PREFIX, mergedInto } from "./catalogueMergeRules"
import { survivorOf } from "./catalogueMerge"

// What a book page (app/(main)/books/[slug]) shows about the book itself. The shared catalog's Work
// comes first, since it's already cached and holds series; a book nobody on Bookmark has shelved yet
// falls back to Open Library. A cover, blurb or page count neither has comes from Hardcover. Cached per
// request, so the metadata and the page share one lookup.
//
// A book Open Library doesn't have is addressed by its catalogue Work's id instead (bookHref), and only
// when the Work came from Hardcover or a librarian approved it (lib/workPages.ts).

const GENRES_SHOWN = 4

export interface BookPageData {
  // What the page is addressed by: the Open Library work key, else the catalogue Work's id.
  key: string
  // The catalogue Work, when there is one (a book nobody has shelved yet comes from Open Library alone).
  workId: string | null
  book: DiscoverBook
  description: string | null
  // Set when the description is Hardcover's and opens with its headline.
  headline?: string | null
  genres: Genre[]
  // Credited to the work's first author, the half of the series' identity a name alone doesn't give.
  series: { name: string, author: string, position: number | null } | null
  editionCount: number | null
  // A hand-typed work a librarian gave a page. Neither Open Library nor Hardcover has it, so nothing is
  // topped up from Hardcover: a search by its title would only find some other book.
  handTyped: boolean
}

// Open Library subjects run from "Fantasy" to "nyt:hardcover-fiction=2023-05-21" in several languages;
// the page shows the Bookmark genres they point at instead, each linking to its Discover shelf.
const genresOf = (subjects: string[]) =>
  genresFromSubjects(subjects).flatMap((label) => GENRES.filter((g) => g.label === label)).slice(0, GENRES_SHOWN)

// `bookKey` is an Open Library work key or a catalogue Work id (normaliseBookKey). A Work that has since
// been matched to Open Library comes back keyed by its work key, so its page redirects there.
export const bookPageData = cache(async (bookKey: string): Promise<BookPageData | null> => {
  const data = await catalogOrOpenLibrary(bookKey)
  if (!data || data.handTyped || (data.book.coverUrl && data.description && data.book.pages)) return data
  const found = await hardcoverRecord(data.book.title, data.book.author)
  if (!found) return data
  return {
    ...data,
    book: topUp(data.book, found),
    description: data.description || found.description || null,
    headline: data.description ? null : found.headline ?? null,
  }
})

async function catalogOrOpenLibrary(bookKey: string, hops = 0): Promise<BookPageData | null> {
  const olKey = normaliseWorkKey(bookKey)
  const select = {
    id: true, key: true, openLibraryKey: true, hardcoverId: true,
    title: true, authors: true, authorKeys: true, description: true, subjects: true, seriesName: true, seriesPosition: true,
    coverUrl: true, firstPublishYear: true, releaseDate: true, olEditionCount: true, curatedFields: true,
    editions: { select: { pages: true, coverUrl: true, curatedFields: true }, take: 20 },
  } as const
  const where = olKey ? { openLibraryKey: olKey } : { id: bookKey, ...hasPageWhere }
  // A duplicate a librarian merged (lib/catalogueMerge.ts) keeps its Open Library key, which the book it
  // was merged into may share: prefer the live work, and only fall back to the merged one.
  const work = await prisma.work.findFirst({ where: { ...where, NOT: { key: { startsWith: MERGED_PREFIX } } }, select })
    ?? await prisma.work.findFirst({ where, select })

  // The merged one shows the book it went into; the page's slug check then redirects to that address.
  if (work && mergedInto(work.key)) {
    const survivor = hops < 2 ? await survivorOf(work.id) : null
    return survivor ? catalogOrOpenLibrary(survivor.openLibraryKey ?? survivor.id, hops + 1) : null
  }

  const workKey = olKey ?? work?.openLibraryKey ?? null
  if (work) {
    const pages = work.editions.flatMap((e) => (e.pages ? [e.pages] : [])).sort((a, b) => a - b)
    // A librarian's cover first. Not every catalog work has its own cover yet: an edition's will do,
    // else Open Library's.
    const coverUrl = librarianCover(work, work.editions)
      ?? work.coverUrl
      ?? work.editions.find((e) => e.coverUrl)?.coverUrl
      ?? (workKey ? await workCover(workKey).catch(() => null) : null)
    return {
      key: workKey ?? work.id,
      workId: work.id,
      book: {
        workKey,
        pageWorkId: work.id,
        title: work.title,
        author: work.authors[0] ?? "Unknown",
        pages: pages.length ? pages[Math.floor(pages.length / 2)] : null,
        coverUrl,
        year: work.firstPublishYear,
        releaseDate: work.releaseDate,
        authorKey: work.authorKeys[0] ?? null,
      },
      description: work.description ?? (workKey ? await workDescription(workKey).catch(() => null) : null),
      genres: genresOf(work.subjects),
      series: work.seriesName && work.authors[0] ? { name: work.seriesName, author: work.authors[0], position: work.seriesPosition } : null,
      editionCount: work.olEditionCount,
      handTyped: !work.openLibraryKey && !work.hardcoverId,
    }
  }

  if (!workKey) return null
  const [found, description] = await Promise.all([
    worksByKeys([workKey]).catch(() => new Map()),
    workDescription(workKey).catch(() => null),
  ])
  const ol = found.get(workKey)
  if (!ol?.title) return null
  return {
    key: workKey,
    workId: null,
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
    handTyped: false,
  }
}
