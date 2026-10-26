// "/works/OL45883W" -> "OL45883W"; anything that doesn't look like a work key becomes null.
export function normaliseWorkKey(key?: string | null) {
  const match = key?.match(/OL\d+W/)
  return match ? match[0] : null
}

const normalise = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

type Comparable = { workKey?: string | null, title: string, author: string }

// Books without a work key (added by hand, or before keys were stored) fall back to title + author.
export function sameBook(a: Comparable, b: Comparable) {
  if (a.workKey && b.workKey) return a.workKey === b.workKey
  return normalise(a.title) === normalise(b.title) && normalise(a.author) === normalise(b.author)
}

// Book pages (/books/OL45883W-dune) are keyed by the Open Library work key; the title after it is
// only for people and search engines, and a stale one redirects to the current. Books without a
// work key (added by hand) have no page.
const TITLE_SLUG_MAX = 60

export function titleSlug(title: string) {
  return title
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .slice(0, TITLE_SLUG_MAX)
    .replace(/^-+|-+$/g, "")
}

export const bookSlug = (workKey: string, title: string) => [workKey, titleSlug(title)].filter(Boolean).join("-")

export function bookHref(book: { workKey?: string | null, title: string }) {
  const workKey = normaliseWorkKey(book.workKey)
  return workKey ? `/books/${encodeURIComponent(bookSlug(workKey, book.title))}` : null
}
