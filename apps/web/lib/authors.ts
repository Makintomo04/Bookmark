import prisma from "@/lib/db"
import { authorBooks, authorRecord, searchAuthors, type DiscoverBook } from "@/lib/openLibrary"
import { authorSlug, creditIncludes, isLinkableAuthor, slugWords } from "@/lib/authorNames"
import { sameBook } from "@/lib/workKey"
import { cleanBookList } from "@/lib/bookListCleanup"
import { bioParagraphs } from "@/lib/authorProfileRules"
import { isThin, toppedUpByTitle } from "@/lib/bookSearchRules"
import { withCatalogueFixesOrAsIs } from "@/lib/curatedBooks"
import { linksFromOpenLibrary, linksFromWikidata, mergeAuthorLinks, type AuthorLink } from "@/lib/authorLinks"
import { wikidataEntity } from "@/lib/wikidata"

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
  // Where the next page starts in the tidied list, or null when this was the last.
  nextOffset: number | null
  // Open Library failed, as opposed to having nothing.
  failed: boolean
  // How many books the list holds once every page is loaded, so "About the author" says the number the
  // reader can scroll through. Null when Open Library failed.
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

// One page of the author's books. The whole list is fetched (cached for a day) and tidied first, with
// our catalog's books added and duplicates, translations, box sets and non-novels left out
// (lib/bookListCleanup.ts), so pages and the total all describe the same list.
export async function authorBooksPage(author: Author, offset = 0): Promise<AuthorBooksPage> {
  const [found, catalog] = await Promise.all([
    authorBooks(author).then((books) => ({ books, failed: false }), () => ({ books: [] as DiscoverBook[], failed: true })),
    catalogBooks(author).catch(() => []),
  ])
  // A search by name can turn up namesakes and books they only edited; by key it's already exact.
  const fromOpenLibrary = author.key ? found.books : found.books.filter((b) => creditIncludes(b.author, author.slug))
  const extra = catalog.filter((c) => !fromOpenLibrary.some((b) => sameBook(b, c)))
  const all = cleanBookList([...fromOpenLibrary, ...extra])
  // A librarian's fix (title, author, cover) wins over Open Library's own, as on book pages.
  const books = await withCatalogueFixesOrAsIs(await filledIn(all.slice(offset, offset + AUTHOR_PAGE_SIZE), catalog, author))
  const nextOffset = offset + AUTHOR_PAGE_SIZE < all.length ? offset + AUTHOR_PAGE_SIZE : null
  return { books, nextOffset, failed: found.failed, total: found.failed ? null : all.length }
}

// Open Library often lists a book with no cover or page count (Kate Posey's Serial Killer Games). Our
// catalogue fills what it can for free, since its Works carry Hardcover covers readers' copies brought in;
// Hardcover's own list of the author's books fills the rest, one cached lookup per author a day.
async function filledIn(books: DiscoverBook[], catalog: DiscoverBook[], author: Author): Promise<DiscoverBook[]> {
  const fromCatalog = toppedUpByTitle(books, catalog)
  if (!fromCatalog.some(isThin)) return fromCatalog
  // Loaded here rather than at the top: it brings in Next's cache, which the bio tests can't load.
  const { hardcoverAuthorBooksOrNone } = await import("@/lib/bookSearch")
  return toppedUpByTitle(fromCatalog, await hardcoverAuthorBooksOrNone(author.slug, author.name))
}

// ---- About the author -------------------------------------------------------------------------

export interface AuthorAbout {
  photoUrl: string | null
  // The bio as plain paragraphs, empty when there isn't one.
  bio: string[]
  // Their website and social accounts, in display order; empty when we know of none.
  links: AuthorLink[]
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

// Photo, bio and links. Without an Open Library key (or with Open Library down) there's none of them; with
// Wikidata down, links fall back to Open Library's own. The book count comes from the book list itself
// (AuthorBooksPage.total), so the two always agree.
export async function authorAbout(author: Author): Promise<AuthorAbout> {
  const record = author.key ? await authorRecord(author.key).catch(() => null) : null
  const entity = record?.wikidataId ? await wikidataEntity(record.wikidataId).catch(() => null) : null
  const curated = await prisma.authorProfile.findUnique({ where: { slug: author.slug }, select: { bio: true, photoUrl: true } }).catch(() => null)
  const photoId = record?.photoIds[0]
  // A librarian's bio or photo, where they set one, wins over Open Library's.
  return {
    photoUrl: curated?.photoUrl ?? (photoId ? `https://covers.openlibrary.org/a/id/${photoId}-M.jpg` : null),
    bio: curated?.bio ? bioParagraphs(curated.bio) : cleanBio(record?.bio),
    links: mergeAuthorLinks(linksFromWikidata(entity), linksFromOpenLibrary(record?.links)),
  }
}
