import { normaliseWorkKey } from "./workKey"

export interface DiscoverBook {
  workKey: string | null
  title: string
  author: string
  pages: number | null
  coverUrl: string | null
  // Optional: books from lists and shelves don't carry it, only fresh Open Library results.
  year?: number | null
}

export const coverUrlFor = (coverId?: number | null, size: "S" | "M" | "L" = "L") =>
  coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null

interface SearchDoc {
  key?: string
  title: string
  author_name?: string[]
  cover_i?: number
  number_of_pages_median?: number
  first_publish_year?: number
}

const FIELDS = "key,title,author_name,cover_i,number_of_pages_median,first_publish_year"

const toDiscoverBooks = (data: any): DiscoverBook[] =>
  ((data?.docs || []) as SearchDoc[])
    .filter((doc) => doc.title)
    .map((doc) => ({
      workKey: normaliseWorkKey(doc.key),
      title: doc.title,
      author: doc.author_name?.[0] || "Unknown",
      pages: doc.number_of_pages_median || null,
      coverUrl: coverUrlFor(doc.cover_i),
      year: doc.first_publish_year || null,
    }))

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
// Cached for a day: rankings change slowly and Open Library is slow.
export async function subjectBooks(subject: string, offset = 0, limit = 24): Promise<DiscoverBook[]> {
  const q = `subject_key:"${subject}" language:eng`
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&sort=readinglog&fields=${FIELDS}&limit=${limit}&offset=${offset}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } })
  if (!res.ok) return []
  return toDiscoverBooks(await res.json())
}
