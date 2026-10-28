import { DESCRIPTION_MAX, type DiscoverBook } from "./openLibrary"
import { sameBook } from "./bookSearchRules"
import { titleKey } from "./bookListCleanup"
import { authorSlug } from "./authorNames"

// Hardcover's catalogue, the fallback when Open Library has nothing for a search: it covers the indie and
// Kindle-only books Open Library misses. Server-only: the token is a personal access token with the
// read:catalog scope (hardcover.app/account/api). Books only, never readers' data, which Hardcover's
// terms keep off commercial products. Docs: docs.hardcover.app/api/guides/searching
//
// Supporter plan: 50,000 requests a day, 60 a minute, so lib/bookSearch.ts only asks when Open Library falls short.

const ENDPOINT = "https://api.hardcover.app/v1/graphql"
// Hardcover cuts search off at 2s on its side; leave room for the round trip.
const TIMEOUT_MS = 4000

const SEARCH = `query Search($query: String!, $perPage: Int!) {
  search(query: $query, query_type: "Book", per_page: $perPage, page: 1) { results }
}`

interface HardcoverDoc {
  id?: string | number
  title?: string
  author_names?: string[]
  image?: { url?: string | null } | null
  release_year?: number | null
  pages?: number | null
  isbns?: string[]
  description?: string | null
  // The publisher's one-line pitch Hardcover shows above the description. Book records have it; search
  // documents don't.
  headline?: string | null
  // The series Hardcover shows the book under. A box set has collection: true.
  featured_series?: { position?: number | null, collection?: boolean, series?: { id?: number, name?: string } | null } | null
}

export const hardcoverConfigured = () => !!process.env.HARDCOVER_API_TOKEN?.trim()

// The account page shows the token with "Bearer " in front; accept it pasted either way.
const authorization = (token: string) => (/^bearer\s/i.test(token) ? token : `Bearer ${token}`)

const pickIsbns = (isbns?: string[]) => ({
  isbn13: isbns?.find((i) => /^\d{13}$/.test(i)) ?? null,
  isbn10: isbns?.find((i) => /^\d{9}[\dX]$/.test(i)) ?? null,
})

// The blurb as Hardcover's book page shows it: the headline, then the description.
export function hardcoverBlurb(headline?: string | null, description?: string | null) {
  const head = headline?.trim()
  const body = description?.trim()
  const blurb = head && body && !body.startsWith(head) ? `${head}\n\n${body}` : body || head
  return blurb?.slice(0, DESCRIPTION_MAX) || null
}

// One search hit as Bookmark's search results take it. No Open Library work key: the catalog files the
// book by ISBN, or by title and author (lib/catalog/resolve.ts).
export function hardcoverBook(doc: HardcoverDoc): DiscoverBook | null {
  const title = doc.title?.trim().replace(/\s+/g, " ")
  // Some names come through with a doubled space ("Kate  Posey").
  const author = doc.author_names?.find((a) => a?.trim())?.trim().replace(/\s+/g, " ")
  if (!title || !author) return null
  return {
    workKey: null,
    title,
    author,
    pages: doc.pages && doc.pages > 0 ? doc.pages : null,
    coverUrl: doc.image?.url || null,
    year: doc.release_year || null,
    editionKey: null,
    ...pickIsbns(doc.isbns),
    authorKey: null,
    description: hardcoverBlurb(doc.headline, doc.description),
    headline: doc.headline?.trim() || null,
    source: "hardcover",
    hardcoverId: doc.id != null && String(doc.id).trim() ? String(doc.id).trim() : null,
  }
}

// One book's Hardcover record, found by title and author, for filling in what Open Library lacks (a
// blurb, a cover). Null when Hardcover has nothing that's the same book. Throws like searchHardcover.
export async function findOnHardcover(title: string, author: string): Promise<DiscoverBook | null> {
  const hits = await searchHardcover(`${title} ${author}`, 5)
  const found = sameBook({ title, author }, hits)
  if (!found?.hardcoverId) return found ?? null
  // Search documents leave the headline out, so it's one more small request; without it, the blurb is
  // just the description.
  const record = await hardcoverQuery(HEADLINE, { id: Number(found.hardcoverId) }).catch(() => null)
  const headline = (record?.books?.[0] as { headline?: string | null } | undefined)?.headline
  return headline ? { ...found, description: hardcoverBlurb(headline, found.description), headline: headline.trim() } : found
}

const HEADLINE = `query Headline($id: Int!) { books(where: { id: { _eq: $id } }) { headline } }`

// One GraphQL request. Throws on any failure (no token, rate limited, expired token, timeout) so a
// failed answer isn't cached.
async function hardcoverQuery(query: string, variables: Record<string, unknown>) {
  const token = process.env.HARDCOVER_API_TOKEN?.trim()
  if (!token) throw new Error("HARDCOVER_API_TOKEN is not set")
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authorization(token),
      "user-agent": "Bookmark book search (fallback for Open Library)",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Hardcover request failed: ${res.status}`)
  const data = await res.json()
  if (data?.errors?.length) throw new Error(`Hardcover request failed: ${JSON.stringify(data.errors).slice(0, 200)}`)
  return data?.data
}

export async function searchHardcover(query: string, limit = 6): Promise<DiscoverBook[]> {
  const data = await hardcoverQuery(SEARCH, { query, perPage: limit })
  const hits = (data?.search?.results?.hits ?? []) as { document?: HardcoverDoc }[]
  return hits.flatMap((hit) => {
    const book = hit.document ? hardcoverBook(hit.document) : null
    return book ? [book] : []
  })
}

export interface HardcoverSeries {
  id: number
  name: string
  // 1, 2, 2.5. Null when Hardcover lists the book in the series without a place.
  position: number | null
}

// Search ranks a short title badly ("Dune" by Frank Herbert isn't in its top five), so the series lookup
// also asks for books with exactly that title, and sorts the search by readers. It searches the title on
// its own too: "The Hobbit J. R. R. Tolkien" misses the book that "The Hobbit" finds first.
const SERIES_OF = `query SeriesOf($query: String!, $title: String!, $titles: [String!]!) {
  search(query: $query, query_type: "Book", per_page: 10, page: 1, sort: "users_count:desc") { results }
  byTitle: search(query: $title, query_type: "Book", per_page: 10, page: 1, sort: "users_count:desc") { results }
  books(where: { title: { _in: $titles }, canonical_id: { _is_null: true } }, order_by: { users_count: desc }, limit: 10) {
    id title users_count
    contributions(limit: 3) { author { name } }
    featured_book_series { position compilation series { id name } }
  }
}`

// "Mistborn: The Final Empire" and "The Hobbit, or There and Back Again" are "Mistborn" and "The Hobbit".
const mainTitle = (title: string) => titleKey(title.split(/\s*[:(]|,\s/)[0])
// The other half of a colon title: "Mistborn: The Final Empire" is also "The Final Empire".
const subtitle = (title: string) => (title.includes(":") ? titleKey(title.slice(title.indexOf(":") + 1).split(/\s*\(/)[0]) : null)
// An audiobook or serial split into parts ("The Final Empire (2 of 3)", "Part 1 of 2 [Dramatized
// Adaptation]") sits between the real books at 1.2 or 1.1; it's never the book itself.
const isPartWork = (title: string) => /\(\s*(?:part\s*)?\d+\s*of\s*\d+\s*\)|\bpart\s+\d+\s+of\s+\d+|dramati[sz]ed/i.test(title)

interface SeriesCandidate {
  title: string
  authors: string[]
  readers: number
  featured: { position?: number | null, collection?: boolean, series?: { id?: number, name?: string } | null } | null | undefined
}

// The series a book is in, from the most-read Hardcover book by the same author with the same title (or
// main title). Null when Hardcover doesn't have the book or has it as a standalone. A box set's series is
// passed over: it isn't the book's place.
export async function hardcoverSeriesOf(title: string, author: string): Promise<HardcoverSeries | null> {
  const data = await hardcoverQuery(SERIES_OF, { query: `${title} ${author}`, title, titles: [title] })
  type Row = { title?: string, users_count?: number | null, contributions?: { author?: { name?: string } | null }[], featured_book_series?: { position?: number | null, compilation?: boolean | null, series?: { id?: number, name?: string } | null } | null }
  const candidates: SeriesCandidate[] = [
    ...([...(data?.search?.results?.hits ?? []), ...(data?.byTitle?.results?.hits ?? [])] as { document?: HardcoverDoc & { users_count?: number | null } }[]).flatMap(({ document: doc }) =>
      doc ? [{ title: doc.title ?? "", authors: doc.author_names ?? [], readers: doc.users_count ?? 0, featured: doc.featured_series }] : []),
    ...((data?.books ?? []) as Row[]).map((b) => ({
      title: b.title ?? "",
      authors: (b.contributions ?? []).flatMap((c) => (c.author?.name ? [c.author.name] : [])),
      readers: b.users_count ?? 0,
      featured: b.featured_book_series && { ...b.featured_book_series, collection: !!b.featured_book_series.compilation },
    })),
  ]
  const who = authorSlug(author)
  const what = mainTitle(title)
  const sameTitle = (c: SeriesCandidate) =>
    titleKey(c.title) === titleKey(title) || mainTitle(c.title) === what || subtitle(c.title) === titleKey(title)
  const best = candidates
    .filter((c) => c.authors.some((a) => authorSlug(a) === who) && !isPartWork(c.title) && sameTitle(c))
    .sort((a, b) => b.readers - a.readers)[0]
  const featured = best?.featured
  if (!featured?.series?.name?.trim() || featured.series.id == null || featured.collection) return null
  const position = typeof featured.position === "number" && Number.isFinite(featured.position) ? featured.position : null
  return { id: Number(featured.series.id), name: featured.series.name.trim(), position }
}

// Every edition and translation of a book sits in book_series at its place; canonical_id is null only on
// the book itself, and the most-read one at a place is the one readers know.
const SERIES_BOOKS = `query SeriesBooks($id: Int!) {
  series(where: { id: { _eq: $id } }, limit: 1) {
    book_series(
      where: { compilation: { _eq: false }, position: { _is_null: false }, book: { canonical_id: { _is_null: true } } }
      order_by: { position: asc }
      limit: 300
    ) { position book { id title pages release_year release_date users_count description headline image { url } contributions(limit: 3) { author { name } } } }
  }
}`

export interface HardcoverSeriesBook extends DiscoverBook {
  position: number
}

// The main books of a series in order, one per whole-numbered place (Book 1, Book 2…), for the series
// tracker's "next". Novellas, part-works and dramatised editions at 1.1 or 2.5 are left out; a reader who
// shelves one still sees it, from their own copy's series. So are books announced but not out yet
// (Hardcover lists Ghostbloods 1 to 3 in The Mistborn Saga for 2028 on): the tracker's "next" is one you
// can read. Only `author`'s own books are kept: a publisher's series by many writers (Canongate's The
// Myths: Atwood, Winterson, Ali Smith) isn't one author's run, and filing its books under one name would
// misattribute them. Each is credited to `author`, the name the series goes by on Bookmark. Throws like
// searchHardcover.
export async function hardcoverSeriesBooks(seriesId: number, author: string, today = new Date()): Promise<HardcoverSeriesBook[]> {
  type Row = { position?: number | null, book?: (HardcoverDoc & { users_count?: number | null, release_date?: string | null, contributions?: { author?: { name?: string } | null }[] }) | null }
  const data = await hardcoverQuery(SERIES_BOOKS, { id: seriesId })
  const now = today.toISOString().slice(0, 10)
  const who = authorSlug(author)
  const best = new Map<number, NonNullable<Row["book"]>>()
  for (const { position, book } of (data?.series?.[0]?.book_series ?? []) as Row[]) {
    if (!book || typeof position !== "number" || !Number.isInteger(position) || position < 1) continue
    if (book.release_date && book.release_date > now) continue
    if (!(book.contributions ?? []).some((c) => c.author?.name && authorSlug(c.author.name) === who)) continue
    const had = best.get(position)
    if (!had || (book.users_count ?? 0) > (had.users_count ?? 0)) best.set(position, book)
  }
  return Array.from(best.entries())
    .sort(([a], [b]) => a - b)
    .flatMap(([position, book]) => {
      const mapped = hardcoverBook({ ...book, author_names: [author] })
      return mapped ? [{ ...mapped, position }] : []
    })
}

const AUTHOR_BY_SLUG = `query AuthorBySlug($slug: String!) {
  authors(where: { slug: { _eq: $slug } }, limit: 1) { id }
}`

const AUTHOR_SEARCH = `query AuthorSearch($query: String!) {
  search(query: $query, query_type: "Author", per_page: 5, page: 1) { results }
}`

const AUTHOR_BOOKS = `query AuthorBooks($id: Int!, $limit: Int!) {
  authors(where: { id: { _eq: $id } }, limit: 1) {
    contributions(limit: $limit, order_by: { book: { users_count: desc } }) {
      book { id title pages release_year description headline image { url } }
    }
  }
}`

// The most-read books before the long tail of duplicate records and translations.
const AUTHOR_BOOKS_MAX = 150

const squashName = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "")

// One author's books on Hardcover, most read first, for filling in the covers and blurbs Open Library's
// list of them lacks (lib/authors.ts). Found by Hardcover's slug for the author, which is usually
// Bookmark's ("kate-posey"), else by searching the name. Each book is credited to `name`, so it matches
// the author page's list. Empty when Hardcover doesn't know the author. Throws like searchHardcover.
export async function hardcoverAuthorBooks(slug: string, name: string): Promise<DiscoverBook[]> {
  let id: unknown = (await hardcoverQuery(AUTHOR_BY_SLUG, { slug }))?.authors?.[0]?.id
  if (id == null) {
    const hits = ((await hardcoverQuery(AUTHOR_SEARCH, { query: name }))?.search?.results?.hits ?? []) as { document?: { id?: string | number, name?: string } }[]
    id = hits.find((h) => h.document?.name && squashName(h.document.name) === squashName(name))?.document?.id
  }
  const authorId = Number(id)
  if (!Number.isInteger(authorId)) return []
  const data = await hardcoverQuery(AUTHOR_BOOKS, { id: authorId, limit: AUTHOR_BOOKS_MAX })
  const contributions = (data?.authors?.[0]?.contributions ?? []) as { book?: HardcoverDoc | null }[]
  return contributions.flatMap(({ book }) => {
    const mapped = book ? hardcoverBook({ ...book, author_names: [name] }) : null
    return mapped ? [mapped] : []
  })
}
