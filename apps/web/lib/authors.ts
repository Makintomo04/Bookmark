import prisma from "@/lib/db"
import { authorBooks, authorRecord, searchAuthors, type DiscoverBook } from "@/lib/openLibrary"
import { authorSlug, creditIncludes, isLinkableAuthor, slugWords } from "@/lib/authorNames"
import { sameBook } from "@/lib/workKey"

// Author pages (/authors/<slug>). The slug comes from the name on a reader's copy; Open Library's author
// key, when a record matches the slug exactly, is what the book list (and, later, following) hangs off.

export interface Author {
  slug: string
  name: string
  // Open Library author key (OL7315784A), or null when no record matches the name.
  key: string | null
}

export const AUTHOR_PAGE_SIZE = 24

const titleCase = (words: string) => words.replace(/(^|\s)(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase())

// Null for a slug no name could link to. Open Library being down still gives an author (by name, without
// a key), so the page can show the reader's own copies.
export async function findAuthor(slug: string): Promise<Author | null> {
  if (!isLinkableAuthor(slugWords(slug))) return null
  const candidates = await searchAuthors(slugWords(slug)).catch(() => [])
  // Most prolific first, so the real author wins over duplicate records and translator credits.
  const match = candidates.find((a) => authorSlug(a.name) === slug)
  return match ? { slug, name: match.name, key: match.key } : { slug, name: titleCase(slugWords(slug)), key: null }
}

export interface AuthorBooksPage {
  books: DiscoverBook[]
  // Where Open Library's next page starts, or null when this was the last. Counts only Open Library's
  // books, not the catalog ones added to the first page.
  nextOffset: number | null
  // Open Library failed, as opposed to having nothing.
  failed: boolean
}

// Our own catalog's works by this author, as add-ready books. Fills in what Open Library's top results
// leave out, which matters most for authors with only a few books.
async function catalogBooks(author: Author): Promise<DiscoverBook[]> {
  const works = await prisma.work.findMany({
    where: { OR: [...(author.key ? [{ authorKeys: { has: author.key } }] : []), { authors: { has: author.name } }] },
    select: { openLibraryKey: true, title: true, authors: true, coverUrl: true, firstPublishYear: true, editions: { select: { pages: true }, where: { pages: { not: null } }, take: 1 } },
    take: 48,
  })
  return works.map((w) => ({
    workKey: w.openLibraryKey,
    title: w.title,
    author: w.authors.find((a) => authorSlug(a) === author.slug) ?? author.name,
    pages: w.editions[0]?.pages ?? null,
    coverUrl: w.coverUrl,
    year: w.firstPublishYear,
  }))
}

export async function authorBooksPage(author: Author, offset = 0): Promise<AuthorBooksPage> {
  const [found, catalog] = await Promise.all([
    authorBooks(author, offset, AUTHOR_PAGE_SIZE).then((books) => ({ books, failed: false }), () => ({ books: [] as DiscoverBook[], failed: true })),
    offset === 0 ? catalogBooks(author).catch(() => []) : Promise.resolve([]),
  ])
  // A search by name can turn up namesakes and books they only edited; by key it's already exact.
  const fromOpenLibrary = author.key ? found.books : found.books.filter((b) => creditIncludes(b.author, author.slug))
  const extra = catalog.filter((c) => !fromOpenLibrary.some((b) => sameBook(b, c)))
  return { books: [...fromOpenLibrary, ...extra], nextOffset: found.books.length === AUTHOR_PAGE_SIZE ? offset + AUTHOR_PAGE_SIZE : null, failed: found.failed }
}

// ---- About the author -------------------------------------------------------------------------

export interface AuthorAbout {
  photoUrl: string | null
  // The bio as plain paragraphs, empty when there isn't one.
  bio: string[]
  // Their works in Bookmark's catalog: the books readers here have added.
  bookCount: number
}

// Open Library bios are volunteer-edited text: Markdown emphasis and links, reference footnotes, Windows
// line endings. Plain paragraphs out, with a "Source:" or footnote line dropped.
export function cleanBio(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*\[\d+\]:\s*\S+.*$/gm, "")
    .replace(/\s*\(\s*\[[^\]]*\]\[\d+\]\s*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[\d+\]/g, "$1")
    .replace(/(\*{1,3}|_{2})(\S[^*_]*?\S|\S)\1/g, "$2")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^(source|sources|from wikipedia)\b[:.]?\s*$/i.test(p))
}

async function catalogCount(author: Author): Promise<number> {
  return prisma.work.count({ where: { OR: [...(author.key ? [{ authorKeys: { has: author.key } }] : []), { authors: { has: author.name } }] } })
}

// Photo, bio and how many of their books are on Bookmark. Without an Open Library key (or with Open Library
// down) there's no photo or bio, only the count.
export async function authorAbout(author: Author): Promise<AuthorAbout> {
  const [record, bookCount] = await Promise.all([
    author.key ? authorRecord(author.key).catch(() => null) : Promise.resolve(null),
    catalogCount(author).catch(() => 0),
  ])
  const photoId = record?.photoIds[0]
  return {
    photoUrl: photoId ? `https://covers.openlibrary.org/a/id/${photoId}-M.jpg` : null,
    bio: cleanBio(record?.bio),
    bookCount,
  }
}
