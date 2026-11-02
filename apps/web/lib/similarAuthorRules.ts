import { authorNames, authorSlug, isLinkableAuthor } from "./authorNames"
import { genresFromSubjects } from "./import/genre"

// "Explore more from similar authors" on a book page: the ranking, with no database access, so tests can
// load it. lib/similarAuthors.ts queries and re-exports these.

export const SIMILAR_AUTHORS_SHOWN = 4
// An author only counts as read alongside this book once this many of its readers shelved them, so the
// section never gives away what one reader has on their shelf.
export const MIN_SHARED_READERS = 2
export const COVERS_PER_AUTHOR = 3

export interface SimilarAuthorBook {
  title: string
  author: string
  coverUrl: string | null
}

export interface SimilarAuthor {
  name: string
  slug: string
  // Open Library author key (OL7315784A), when a work credits them with one: their photo hangs off it.
  key: string | null
  books: SimilarAuthorBook[]
}

// A copy on the shelf of someone who also shelved this book.
export interface CoReadCopy {
  userId: string
  // What makes two copies the same book: the work id or key, else the title.
  bookId: string
  title: string
  author: string
  // The lead author's Open Library key, when the copy's catalogue work has it.
  authorKey: string | null
  coverUrl: string | null
  subjects: string[]
}

// A catalogue work sharing genre subjects with this book.
export interface GenreWork {
  bookId: string
  title: string
  authors: string[]
  // In step with `authors` where Open Library had them (Work.authorKeys).
  authorKeys: string[]
  coverUrl: string | null
  subjects: string[]
  // Open Library's reading-log count, for which of two equally close works goes first.
  popularity: number | null
}

// Explicit and dark books, as Open Library subjects (lib/genrePicks.ts keeps the same out of genre picks).
// Stored subjects read "Dark romance" or "Fiction, erotica, general", so they're compared as keys.
const MATURE_SUBJECTS = new Set(["dark_romance", "erotica", "erotic_literature", "erotic_fiction", "fiction_erotica_general", "sexual_abuse", "bdsm"])
const subjectKey = (subject: string) => subject.trim().toLowerCase().replace(/[\s,]+/g, "_")
export const isMature = (subjects: string[]) => subjects.some((s) => MATURE_SUBJECTS.has(subjectKey(s)))

// The book's subjects that point at a Bookmark genre ("Fantasy fiction", not "Fiction" or "Friendship").
// Matching another work on these is what "same genre" means here.
export const genreSubjects = (subjects: string[]) =>
  subjects.slice(0, 25).filter((s) => genresFromSubjects([s]).length > 0 && !MATURE_SUBJECTS.has(subjectKey(s)))

const leadAuthor = (credit: string) => authorNames(credit)[0] ?? null

interface Ranked {
  name: string
  key: string | null
  books: Map<string, SimilarAuthorBook>
}

// Authors read by this book's readers first, most shared readers first; then authors writing in the same
// genres, closest first. The book's own authors are left out, and a mature book only suggests another
// when this one is mature too.
export function rankSimilarAuthors({ excludeAuthors, mature, coRead, sameGenre }: {
  excludeAuthors: string[]
  mature: boolean
  coRead: CoReadCopy[]
  sameGenre: GenreWork[]
}): SimilarAuthor[] {
  const excluded = new Set(excludeAuthors.flatMap((a) => authorNames(a)).map(authorSlug))
  const ranked = new Map<string, Ranked>()
  const allowed = (name: string | null, subjects: string[]): name is string =>
    !!name && isLinkableAuthor(name) && !excluded.has(authorSlug(name)) && (mature || !isMature(subjects))
  const add = (name: string, key: string | null, bookId: string, book: SimilarAuthorBook) => {
    const slug = authorSlug(name)
    const entry = ranked.get(slug) ?? { name, key: null, books: new Map() }
    entry.key ??= key
    if (!entry.books.has(bookId)) entry.books.set(bookId, book)
    ranked.set(slug, entry)
  }

  // Readers per author, and per book within each author so their most-read books are the covers shown.
  const readersOf = new Map<string, Set<string>>()
  const bookReaders = new Map<string, Set<string>>()
  for (const copy of coRead) {
    const name = leadAuthor(copy.author)
    if (!allowed(name, copy.subjects)) continue
    const slug = authorSlug(name)
    readersOf.set(slug, (readersOf.get(slug) ?? new Set()).add(copy.userId))
    bookReaders.set(copy.bookId, (bookReaders.get(copy.bookId) ?? new Set()).add(copy.userId))
  }
  const byReaders = [...coRead].sort((a, b) => (bookReaders.get(b.bookId)?.size ?? 0) - (bookReaders.get(a.bookId)?.size ?? 0))
  const coReadAuthors = [...readersOf].filter(([, readers]) => readers.size >= MIN_SHARED_READERS)
    .sort(([a, x], [b, y]) => y.size - x.size || a.localeCompare(b))
    .map(([slug]) => slug)
  for (const slug of coReadAuthors) {
    for (const copy of byReaders) {
      const name = leadAuthor(copy.author)
      if (name && authorSlug(name) === slug) add(name, copy.authorKey, copy.bookId, { title: copy.title, author: copy.author, coverUrl: copy.coverUrl })
    }
  }

  // sameGenre comes sorted closest first (closestFirst below).
  for (const work of sameGenre) {
    // The first real person credited: "Unknown" or "Anonymous" ahead of them doesn't hide them.
    const at = work.authors.findIndex((a) => { const n = leadAuthor(a); return !!n && isLinkableAuthor(n) })
    const name = at < 0 ? null : leadAuthor(work.authors[at])
    if (!allowed(name, work.subjects)) continue
    add(name, work.authorKeys[at] ?? null, work.bookId, { title: work.title, author: name, coverUrl: work.coverUrl })
  }

  return [...ranked].slice(0, SIMILAR_AUTHORS_SHOWN).map(([slug, { name, key, books }]) => ({
    name,
    slug,
    key,
    // Books with covers first, so the stack shows the author's books rather than placeholders.
    books: [...books.values()].sort((a, b) => Number(!!b.coverUrl) - Number(!!a.coverUrl)).slice(0, COVERS_PER_AUTHOR),
  }))
}

// Closest first: the most genre subjects in common, then the more widely read.
export const closestFirst = (subjects: string[]) => (a: GenreWork, b: GenreWork) => {
  const shared = (w: GenreWork) => w.subjects.filter((s) => subjects.includes(s)).length
  return shared(b) - shared(a) || (b.popularity ?? 0) - (a.popularity ?? 0)
}

const titleKey = (title: string) => title.trim().toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/\W+/g, " ").trim()

// The books that picked an author can be just one; their catalogue fills the rest of the stack, most
// read first (`catalogue` comes in that order). A book already shown isn't shown twice, mature ones only
// on a mature book, and the books that picked them stay in front.
export function toppedUpAuthors(authors: SimilarAuthor[], catalogue: GenreWork[], mature: boolean): SimilarAuthor[] {
  return authors.map((author) => {
    if (author.books.length >= COVERS_PER_AUTHOR) return author
    const books = [...author.books]
    for (const work of catalogue) {
      if (books.length >= COVERS_PER_AUTHOR) break
      const credited = work.authors.flatMap((a) => authorNames(a)).some((n) => authorSlug(n) === author.slug)
        || (!!author.key && work.authorKeys.includes(author.key))
      if (!credited || (!mature && isMature(work.subjects))) continue
      if (books.some((b) => titleKey(b.title) === titleKey(work.title))) continue
      books.push({ title: work.title, author: author.name, coverUrl: work.coverUrl })
    }
    return { ...author, books }
  })
}
