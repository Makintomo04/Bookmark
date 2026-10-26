import { normaliseWorkKey } from "./workKey.ts"

export interface DiscoverBook {
  workKey: string | null
  title: string
  author: string
  pages: number | null
  coverUrl: string | null
  // Optional: books from lists and shelves don't carry it, only fresh Open Library results.
  year?: number | null
  // Optional, from fresh results only: the edition Open Library ranks first for the query, so a book
  // added from search lands on a real Edition in the catalog (lib/catalog.ts) rather than a guess.
  editionKey?: string | null
  isbn13?: string | null
  isbn10?: string | null
  // Optional, from fresh results only: the first author's Open Library key (OL7315784A).
  authorKey?: string | null
}

export const coverUrlFor = (coverId?: number | null, size: "S" | "M" | "L" = "L") =>
  coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null

interface SearchDoc {
  key?: string
  title: string
  author_name?: string[]
  author_key?: string[]
  cover_i?: number
  number_of_pages_median?: number
  first_publish_year?: number
  subject?: string[]
  // The "editions" sub-query: the edition that best matches the search, with its ISBNs.
  editions?: { docs?: { key?: string, isbn?: string[] }[] }
}

const FIELDS = "key,title,author_name,author_key,cover_i,number_of_pages_median,first_publish_year,editions,editions.key,editions.isbn"

const pickIsbns = (isbns?: string[]) => ({
  isbn13: isbns?.find((i) => /^\d{13}$/.test(i)) ?? null,
  isbn10: isbns?.find((i) => /^\d{9}[\dX]$/.test(i)) ?? null,
})

const toDiscoverBooks = (data: any): DiscoverBook[] =>
  ((data?.docs || []) as SearchDoc[])
    .filter((doc) => doc.title)
    .map((doc) => {
      const edition = doc.editions?.docs?.[0]
      return {
        workKey: normaliseWorkKey(doc.key),
        title: doc.title,
        author: doc.author_name?.[0] || "Unknown",
        pages: doc.number_of_pages_median || null,
        coverUrl: coverUrlFor(doc.cover_i),
        year: doc.first_publish_year || null,
        editionKey: edition?.key?.match(/OL\d+M/)?.[0] ?? null,
        ...pickIsbns(edition?.isbn),
        authorKey: normaliseAuthorKey(doc.author_key?.[0]),
      }
    })

// "/authors/OL7315784A" -> "OL7315784A"; anything else becomes null.
export function normaliseAuthorKey(key?: string | null) {
  const match = key?.match(/OL\d+A/)
  return match ? match[0] : null
}

export async function searchBooks(query: string, limit = 6): Promise<DiscoverBook[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=${FIELDS}&limit=${limit}`
  // Open Library's search often takes 3–6s. A failure throws, so callers can tell it from no matches.
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) })
  if (!res.ok) throw new Error(`Open Library search failed: ${res.status}`)
  return toDiscoverBooks(await res.json())
}

// Work descriptions are user-edited Markdown. Many trail a "----------" block of edition notes or
// "Also contained in" links, or cite a source with reference-style links; keep just the prose.
export function cleanDescription(raw: string) {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*-{3,}/)[0]
    .replace(/^\s*\[\d+\]:\s*\S+.*$/gm, "")
    .replace(/\(\s*\[(?:source|from)[^\]]*\]\s*(?:\[\d+\]|\([^)]*\))\s*\)/gi, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[\d+\]/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

export const DESCRIPTION_MAX = 3000

// Cached for a week: descriptions rarely change, and this sits in the add-book flow.
export async function workDescription(workKey: string): Promise<string | null> {
  const res = await fetch(`https://openlibrary.org/works/${workKey}.json`, {
    signal: AbortSignal.timeout(6000),
    next: { revalidate: 604800 },
  })
  if (!res.ok) return null
  const data = await res.json()
  const raw = typeof data?.description === "string" ? data.description : data?.description?.value
  if (typeof raw !== "string") return null
  return cleanDescription(raw)?.slice(0, DESCRIPTION_MAX) ?? null
}

// Ranked by how many Open Library readers have shelved each book, which surfaces far more familiar
// titles than the subjects feed (ordered by edition count), and comes with page counts.
// Cached for a day: rankings change slowly and Open Library is slow. `exclude` drops works tagged with
// any of those subject keys (the genre picks use it to keep explicit books out of unasked-for suggestions).
export async function subjectBooks(subject: string, offset = 0, limit = 24, exclude: string[] = []): Promise<DiscoverBook[]> {
  const q = [`subject_key:"${subject}" language:eng`, ...exclude.map((s) => `-subject_key:"${s}"`)].join(" ")
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&sort=readinglog&fields=${FIELDS}&limit=${limit}&offset=${offset}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } })
  if (!res.ok) return []
  return toDiscoverBooks(await res.json())
}

export interface OpenLibraryAuthor {
  key: string
  name: string
  workCount: number
}

// Authors whose name matches a query, most prolific first. Several records often share a name (duplicates,
// translators credited alongside), so the caller picks. Cached for a week: names and keys rarely change.
export async function searchAuthors(query: string, limit = 10): Promise<OpenLibraryAuthor[]> {
  const url = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(query)}&fields=key,name,work_count&limit=${limit}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 604800 } })
  if (!res.ok) throw new Error(`Open Library author search failed: ${res.status}`)
  const data = await res.json()
  return ((data?.docs || []) as { key?: string, name?: string, work_count?: number }[])
    .flatMap((doc) => {
      const key = normaliseAuthorKey(doc.key)
      return key && doc.name ? [{ key, name: doc.name, workCount: doc.work_count || 0 }] : []
    })
    .sort((a, b) => b.workCount - a.workCount)
}

// An author's books, most shelved first, like subjectBooks. By key when we have one; otherwise by name,
// which can also catch namesakes. Throws on failure so the author page can tell it from "no books".
// Cached for a day.
export async function authorBooks(by: { key?: string | null, name: string }, offset = 0, limit = 24): Promise<DiscoverBook[]> {
  const q = by.key ? `author_key:${by.key}` : `author:"${by.name.replace(/"/g, "")}"`
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&sort=readinglog&fields=${FIELDS}&limit=${limit}&offset=${offset}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`Open Library author books failed: ${res.status}`)
  return toDiscoverBooks(await res.json())
}

// Open Library's index keeps a reading-log activity count for each of the last seven days.
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const TRENDING_FIELDS = `${FIELDS},${DAYS.map((d) => `trending_score_daily_${d}`).join(",")}`
const TRENDING_POOL = 200
const weekScore = (doc: any) => DAYS.reduce((sum, d) => sum + (doc[`trending_score_daily_${d}`] || 0), 0)

// Ranked by reader activity over the past week. Search can't sort by that directly (its "trending"
// sort is a spike score that favours obscure titles), so this takes the books most active in the last
// day and re-ranks them by their seven-day total. Pages beyond the pool come back empty.
// Cached for six hours: the daily counts only move once a day.
export async function trendingSubjectBooks(subject: string, offset = 0, limit = 24): Promise<DiscoverBook[]> {
  const q = `subject_key:"${subject}" language:eng`
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&sort=trending_score_hourly_sum&fields=${TRENDING_FIELDS}&limit=${TRENDING_POOL}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 21600 } })
  if (!res.ok) return []
  const data = await res.json()
  const docs = [...(data?.docs || [])].sort((a, b) => weekScore(b) - weekScore(a))
  return toDiscoverBooks({ docs: docs.slice(offset, offset + limit) })
}

// ---- Catalog lookups (lib/catalog) -----------------------------------------------------------

export interface OpenLibraryWork {
  workKey: string
  title: string | null
  authors: string[]
  authorKeys: string[]
  coverUrl: string | null
  year: number | null
  subjects: string[]
  pages: number | null
}

const WORK_FIELDS = "key,title,author_name,author_key,cover_i,first_publish_year,subject,number_of_pages_median"
export const WORKS_PER_REQUEST = 25

const toWork = (doc: SearchDoc): OpenLibraryWork | null => {
  const workKey = normaliseWorkKey(doc.key)
  return workKey
    ? {
        workKey,
        title: doc.title || null,
        authors: doc.author_name ?? [],
        authorKeys: (doc.author_key ?? []).map(normaliseAuthorKey).filter((k): k is string => !!k),
        coverUrl: coverUrlFor(doc.cover_i),
        year: doc.first_publish_year || null,
        subjects: doc.subject ?? [],
        pages: doc.number_of_pages_median || null,
      }
    : null
}

// Several works in one request (`key:/works/A OR key:/works/B`): title, authors, cover, year and subjects.
// Throws on failure so callers can tell it from "not found".
export async function worksByKeys(workKeys: string[]): Promise<Map<string, OpenLibraryWork>> {
  const found = new Map<string, OpenLibraryWork>()
  const keys = Array.from(new Set(workKeys.map((k) => normaliseWorkKey(k)).filter((k): k is string => !!k))).slice(0, WORKS_PER_REQUEST)
  if (!keys.length) return found
  const q = keys.map((k) => `key:/works/${k}`).join(" OR ")
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=${WORK_FIELDS}&limit=${keys.length}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Open Library work lookup failed: ${res.status}`)
  const data = await res.json()
  for (const doc of (data?.docs || []) as SearchDoc[]) {
    const work = toWork(doc)
    if (work) found.set(work.workKey, work)
  }
  return found
}

// How widely read a work is on Open Library: its edition count, star ratings and reading-log entries
// (want to read, reading, read). Recaps use it to tell a book the model knows from one it would guess at.
export interface OpenLibraryPopularity {
  editions: number
  ratings: number
  readingLog: number
}

const POPULARITY_FIELDS = "key,edition_count,ratings_count,readinglog_count"

// Several works in one request, like worksByKeys. Throws on failure so callers can tell it from "not found".
export async function workPopularity(workKeys: string[]): Promise<Map<string, OpenLibraryPopularity>> {
  const found = new Map<string, OpenLibraryPopularity>()
  const keys = Array.from(new Set(workKeys.map((k) => normaliseWorkKey(k)).filter((k): k is string => !!k))).slice(0, WORKS_PER_REQUEST)
  if (!keys.length) return found
  const q = keys.map((k) => `key:/works/${k}`).join(" OR ")
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=${POPULARITY_FIELDS}&limit=${keys.length}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Open Library popularity lookup failed: ${res.status}`)
  const data = await res.json()
  const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0)
  for (const doc of (data?.docs || []) as { key?: string, edition_count?: number, ratings_count?: number, readinglog_count?: number }[]) {
    const workKey = normaliseWorkKey(doc.key)
    if (workKey) found.set(workKey, { editions: count(doc.edition_count), ratings: count(doc.ratings_count), readingLog: count(doc.readinglog_count) })
  }
  return found
}

export interface OpenLibraryEdition {
  editionKey: string | null
  workKey: string | null
  title: string | null
  isbn13: string | null
  isbn10: string | null
  pages: number | null
  publisher: string | null
  // "2012", "June 1, 1990": the caller picks the year out.
  publishDate: string | null
  // "Paperback", "Audio CD"...: the caller maps it to a format.
  physicalFormat: string | null
  coverUrl: string | null
  series: string[]
}

// One edition by ISBN (either form), from /isbn/<isbn>.json. Null when Open Library has no such edition.
export async function editionByIsbn(isbn: string): Promise<OpenLibraryEdition | null> {
  const clean = isbn.replace(/[^0-9Xx]/g, "").toUpperCase()
  if (!/^(\d{13}|\d{9}[\dX])$/.test(clean)) return null
  const res = await fetch(`https://openlibrary.org/isbn/${clean}.json`, { signal: AbortSignal.timeout(8000), redirect: "follow" })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Open Library ISBN lookup failed: ${res.status}`)
  const data = await res.json()
  if (!data || typeof data !== "object") return null
  return {
    editionKey: typeof data.key === "string" ? data.key.match(/OL\d+M/)?.[0] ?? null : null,
    workKey: normaliseWorkKey(data.works?.[0]?.key),
    title: typeof data.title === "string" ? data.title : null,
    isbn13: data.isbn_13?.[0] ?? null,
    isbn10: data.isbn_10?.[0] ?? null,
    pages: typeof data.number_of_pages === "number" && data.number_of_pages > 0 ? data.number_of_pages : null,
    publisher: data.publishers?.[0] ?? null,
    publishDate: typeof data.publish_date === "string" ? data.publish_date : null,
    physicalFormat: typeof data.physical_format === "string" ? data.physical_format : null,
    coverUrl: coverUrlFor(data.covers?.find((c: unknown) => typeof c === "number" && c > 0)),
    series: Array.isArray(data.series) ? data.series.filter((x: unknown) => typeof x === "string") : [],
  }
}
