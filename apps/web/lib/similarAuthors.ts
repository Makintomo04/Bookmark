import { unstable_cache } from "next/cache"
import prisma from "./db"
import { sharedBookWhere } from "./privacy"
import { copiesOfWork } from "./readerCounts"
import { MERGED_PREFIX } from "./catalogueMergeRules"
import { authorNames, authorSlug } from "./authorNames"
import { COVERS_PER_AUTHOR, closestFirst, genreSubjects, isMature, rankSimilarAuthors, toppedUpAuthors, type CoReadCopy, type GenreWork, type SimilarAuthor } from "./similarAuthorRules"

export * from "./similarAuthorRules"

// How far each signal looks. Enough for a well-read book's neighbours without reading every shelf.
const READERS_SAMPLED = 300
const COPIES_SAMPLED = 3000
const GENRE_WORKS_SAMPLED = 200
// Neighbours change slowly, and the genre match reads a good slice of the catalogue.
const SIMILAR_AUTHORS_TTL = 6 * 60 * 60

// "Explore more from similar authors" for a book page (lib/similarAuthorRules.ts says how they're ranked).
// Empty when neither signal finds anyone, or the database is unreachable: the page leaves the section out.
export async function similarAuthors(book: SimilarAuthorsInput): Promise<SimilarAuthorWithPhoto[]> {
  return cachedSimilarAuthors(book).then(withPhotos).catch((error) => {
    console.error("similar authors failed", error)
    return []
  })
}

export interface SimilarAuthorWithPhoto extends SimilarAuthor {
  photoUrl: string | null
}

// A librarian's photo where they set one, else Open Library's by author key; null leaves the initials. Not
// cached with the authors, so a photo a librarian sets shows on the next visit.
async function withPhotos(authors: SimilarAuthor[]): Promise<SimilarAuthorWithPhoto[]> {
  const curated = authors.length
    ? await prisma.authorProfile.findMany({ where: { slug: { in: authors.map((a) => a.slug) }, photoUrl: { not: null } }, select: { slug: true, photoUrl: true } }).catch(() => [])
    : []
  return authors.map((author) => ({
    ...author,
    // default=false: a photo Open Library doesn't have is a 404, which the card turns into initials.
    photoUrl: curated.find((c) => c.slug === author.slug)?.photoUrl
      ?? (author.key ? `https://covers.openlibrary.org/a/olid/${author.key}-M.jpg?default=false` : null),
  }))
}

interface SimilarAuthorsInput {
  bookKey: string
  workId: string | null
  authors: string[]
  subjects: string[]
}

// A failed lookup throws, so it isn't cached and the next visit tries again.
const cachedSimilarAuthors = unstable_cache(
  async ({ bookKey, workId, authors, subjects }: SimilarAuthorsInput) => {
    const [coRead, sameGenre] = await Promise.all([coReadCopies(bookKey), genreWorks(workId, subjects)])
    const mature = isMature(subjects)
    const ranked = rankSimilarAuthors({ excludeAuthors: authors, mature, coRead, sameGenre })
    return toppedUpAuthors(ranked, await catalogueOf(ranked, workId), mature)
  },
  ["similar-authors"],
  { revalidate: SIMILAR_AUTHORS_TTL },
)

// What this book's readers have on their shelves besides it. Shared copies only, as for the book's rating.
async function coReadCopies(bookKey: string): Promise<CoReadCopy[]> {
  const thisBook = await copiesOfWork(bookKey)
  const readers = await prisma.book.findMany({
    where: { AND: [thisBook, sharedBookWhere] },
    select: { userId: true },
    distinct: ["userId"],
    take: READERS_SAMPLED,
  })
  if (readers.length < 2) return []
  const copies = await prisma.book.findMany({
    where: { userId: { in: readers.map((r) => r.userId) }, NOT: thisBook, AND: [sharedBookWhere] },
    select: { userId: true, workId: true, workKey: true, title: true, author: true, coverImage: true, work: { select: { coverUrl: true, subjects: true, authors: true, authorKeys: true } } },
    orderBy: { createdAt: "desc" },
    take: COPIES_SAMPLED,
  })
  return copies.map((c) => {
    // The work's key is only the copy's author's when the work credits the same person first.
    const lead = authorNames(c.author)[0]
    const workLead = c.work?.authors[0]
    const authorKey = lead && workLead && authorSlug(lead) === authorSlug(workLead) ? c.work?.authorKeys[0] ?? null : null
    return {
      userId: c.userId,
      bookId: c.workId ?? c.workKey ?? `title:${c.title.trim().toLowerCase()}`,
      title: c.title,
      author: c.author,
      coverUrl: c.work?.coverUrl || c.coverImage || null,
      authorKey,
      subjects: c.work?.subjects ?? [],
    }
  })
}

// Catalogue works sharing the book's genre subjects, closest first.
async function genreWorks(workId: string | null, subjects: string[]): Promise<GenreWork[]> {
  const wanted = genreSubjects(subjects)
  if (wanted.length === 0) return []
  const works = await prisma.work.findMany({
    where: {
      subjects: { hasSome: wanted },
      coverUrl: { not: null },
      NOT: [{ key: { startsWith: MERGED_PREFIX } }, ...(workId ? [{ id: workId }] : [])],
    },
    select: { id: true, title: true, authors: true, authorKeys: true, coverUrl: true, subjects: true, olReadingLogCount: true },
    orderBy: { olReadingLogCount: "desc" },
    take: GENRE_WORKS_SAMPLED,
  })
  return works
    .map((w) => ({ bookId: w.id, title: w.title, authors: w.authors, authorKeys: w.authorKeys, coverUrl: w.coverUrl, subjects: w.subjects, popularity: w.olReadingLogCount }))
    .sort(closestFirst(wanted))
}

// The catalogue's books by the authors whose stacks are short, with covers, most read first. One query for
// them all; by name and, where we have it, Open Library key, since a credit can be spelt either way.
async function catalogueOf(authors: SimilarAuthor[], workId: string | null): Promise<GenreWork[]> {
  const short = authors.filter((a) => a.books.length < COVERS_PER_AUTHOR)
  if (short.length === 0) return []
  const works = await prisma.work.findMany({
    where: {
      OR: [{ authors: { hasSome: short.map((a) => a.name) } }, { authorKeys: { hasSome: short.flatMap((a) => (a.key ? [a.key] : [])) } }],
      coverUrl: { not: null },
      NOT: [{ key: { startsWith: MERGED_PREFIX } }, ...(workId ? [{ id: workId }] : [])],
    },
    select: { id: true, title: true, authors: true, authorKeys: true, coverUrl: true, subjects: true, olReadingLogCount: true },
    orderBy: { olReadingLogCount: "desc" },
    take: short.length * 15,
  })
  return works.map((w) => ({ bookId: w.id, title: w.title, authors: w.authors, authorKeys: w.authorKeys, coverUrl: w.coverUrl, subjects: w.subjects, popularity: w.olReadingLogCount }))
}
