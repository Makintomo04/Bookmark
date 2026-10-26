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
  // How many books the list holds once every page is loaded, so "About the author" can say the same
  // number the reader can scroll through. Only on the first page; null when it can't be known up front
  // (a search by name, which filters out namesakes page by page, or Open Library failing).
  total: number | null
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
    authorBooks(author, offset, AUTHOR_PAGE_SIZE).then(({ books, total }) => ({ books, total, failed: false }), () => ({ books: [] as DiscoverBook[], total: 0, failed: true })),
    offset === 0 ? catalogBooks(author).catch(() => []) : Promise.resolve([]),
  ])
  // A search by name can turn up namesakes and books they only edited; by key it's already exact.
  const fromOpenLibrary = author.key ? found.books : found.books.filter((b) => creditIncludes(b.author, author.slug))
  const extra = catalog.filter((c) => !fromOpenLibrary.some((b) => sameBook(b, c)))
  const nextOffset = found.books.length === AUTHOR_PAGE_SIZE ? offset + AUTHOR_PAGE_SIZE : null
  const books = [...fromOpenLibrary, ...extra]
  // By key the search's own count is exact; our catalog's extras are added on top. By name, only a
  // single page is a known total.
  const total = offset > 0 || found.failed ? null : author.key ? found.total + extra.length : nextOffset === null ? books.length : null
  return { books, nextOffset, failed: found.failed, total }
}

// ---- About the author -------------------------------------------------------------------------

export interface AuthorAbout {
  photoUrl: string | null
  // The bio as plain paragraphs, empty when there isn't one.
  bio: string[]
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

// Photo and bio. Without an Open Library key (or with Open Library down) there's neither. The book count
// comes from the book list itself (AuthorBooksPage.total), so the two always agree.
export async function authorAbout(author: Author): Promise<AuthorAbout> {
  const record = author.key ? await authorRecord(author.key).catch(() => null) : null
  const photoId = record?.photoIds[0]
  return {
    photoUrl: photoId ? `https://covers.openlibrary.org/a/id/${photoId}-M.jpg` : null,
    bio: cleanBio(record?.bio),
  }
}
