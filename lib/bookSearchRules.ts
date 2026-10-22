import type { DiscoverBook } from "./openLibrary"

// How book search turns Bookmark's own shelves into results and blends them with Open Library's. No database.

const MAX_TOKENS = 5

// "  The Hobbit, Tolkien " -> "the hobbit, tolkien": one cache key however it was typed.
export const normaliseQuery = (query: string) => query.trim().toLowerCase().replace(/\s+/g, " ")

// Words worth matching on. Punctuation-only bits ("-", ",") would match everything.
export function queryTokens(query: string) {
  return normaliseQuery(query)
    .split(" ")
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((t) => t.length > 0)
    .slice(0, MAX_TOKENS)
}

export interface ShelfRow {
  workKey: string | null
  title: string
  author: string
  pages: number
  coverImage: string
}

const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()

// Readers' copies of the same work collapse into one result, ranked by how well the title matches and then
// by how many readers have it. Pages and cover come from the copy most readers agree on.
export function rankShelfRows(rows: ShelfRow[], query: string, limit: number): DiscoverBook[] {
  const q = fold(query)
  const byWork = new Map<string, ShelfRow[]>()
  for (const row of rows) {
    if (!row.workKey) continue
    const group = byWork.get(row.workKey)
    if (group) group.push(row)
    else byWork.set(row.workKey, [row])
  }

  const scored = Array.from(byWork, ([workKey, copies]) => {
    const first = copies[0]
    const title = fold(first.title)
    const match = title === q ? 3 : title.startsWith(q) ? 2 : title.includes(q) ? 1 : 0
    const book: DiscoverBook = {
      workKey,
      title: first.title,
      author: first.author,
      pages: mostCommon(copies.map((c) => c.pages).filter((p) => p > 0)),
      coverUrl: mostCommon(copies.map((c) => c.coverImage).filter(Boolean)),
    }
    return { book, match, readers: copies.length }
  })

  return scored
    .sort((a, b) => b.match - a.match || b.readers - a.readers)
    .slice(0, limit)
    .map((s) => s.book)
}

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>()
  let best: T | null = null
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1
    counts.set(v, n)
    if (best === null || n > counts.get(best)!) best = v
  }
  return best
}

// Bookmark's own matches lead, but take at most half the slots so a reader's niche pick can't push the
// catalogue's best match off the list. An Open Library result already shown from a shelf is dropped; the
// shelf copy keeps its mirrored cover, and Open Library fills in the publication year.
export function mergeResults(local: DiscoverBook[], remote: DiscoverBook[], limit: number): DiscoverBook[] {
  const remoteByKey = new Map(remote.filter((b) => b.workKey).map((b) => [b.workKey, b]))
  const lead = local.slice(0, Math.ceil(limit / 2)).map((b) => {
    const match = b.workKey ? remoteByKey.get(b.workKey) : undefined
    return match ? { ...b, year: b.year ?? match.year ?? null, pages: b.pages ?? match.pages } : b
  })
  const shown = new Set(lead.map((b) => b.workKey))
  const rest = remote.filter((b) => !b.workKey || !shown.has(b.workKey))
  return [...lead, ...rest].slice(0, limit)
}
