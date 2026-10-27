import { DESCRIPTION_MAX, type DiscoverBook } from "./openLibrary"
import { sameBook } from "./bookSearchRules"

// Hardcover's catalogue, the fallback when Open Library has nothing for a search: it covers the indie and
// Kindle-only books Open Library misses. Server-only: the token is a personal access token with the
// read:catalog scope (hardcover.app/account/api). Books only, never readers' data, which Hardcover's
// terms keep off commercial products. Docs: docs.hardcover.app/api/guides/searching
//
// Free plan: 5,000 requests a day, 60 a minute, so lib/bookSearch.ts only asks when Open Library falls short.

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
}

export const hardcoverConfigured = () => !!process.env.HARDCOVER_API_TOKEN?.trim()

// The account page shows the token with "Bearer " in front; accept it pasted either way.
const authorization = (token: string) => (/^bearer\s/i.test(token) ? token : `Bearer ${token}`)

const pickIsbns = (isbns?: string[]) => ({
  isbn13: isbns?.find((i) => /^\d{13}$/.test(i)) ?? null,
  isbn10: isbns?.find((i) => /^\d{9}[\dX]$/.test(i)) ?? null,
})

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
    description: doc.description?.trim().slice(0, DESCRIPTION_MAX) || null,
    source: "hardcover",
    hardcoverId: doc.id != null && String(doc.id).trim() ? String(doc.id).trim() : null,
  }
}

// One book's Hardcover record, found by title and author, for filling in what Open Library lacks (a
// blurb, a cover). Null when Hardcover has nothing that's the same book. Throws like searchHardcover.
export async function findOnHardcover(title: string, author: string): Promise<DiscoverBook | null> {
  const hits = await searchHardcover(`${title} ${author}`, 5)
  return sameBook({ title, author }, hits) ?? null
}

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

const AUTHOR_BY_SLUG = `query AuthorBySlug($slug: String!) {
  authors(where: { slug: { _eq: $slug } }, limit: 1) { id }
}`

const AUTHOR_SEARCH = `query AuthorSearch($query: String!) {
  search(query: $query, query_type: "Author", per_page: 5, page: 1) { results }
}`

const AUTHOR_BOOKS = `query AuthorBooks($id: Int!, $limit: Int!) {
  authors(where: { id: { _eq: $id } }, limit: 1) {
    contributions(limit: $limit, order_by: { book: { users_count: desc } }) {
      book { id title pages release_year description image { url } }
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
