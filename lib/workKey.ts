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
