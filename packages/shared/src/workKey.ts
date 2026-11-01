// "/works/OL45883W" -> "OL45883W"; anything that doesn't look like a work key becomes null.
export function normaliseWorkKey(key?: string | null) {
  const match = key?.match(/OL\d+W/)
  return match ? match[0] : null
}

// A search box's "OL45883W", "/works/OL45883W" or pasted openlibrary.org link: the work key. A title is never one.
export const workKeyOfQuery = (query: string) => (/\s/.test(query.trim()) ? null : normaliseWorkKey(query.trim().toUpperCase()))

const normalise = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

type Comparable = { workKey?: string | null, title: string, author: string }

// The same title by the same author, whatever their keys say: two Open Library works for one book are common.
export const sameTitleAndAuthor = (a: Comparable, b: Comparable) => normalise(a.title) === normalise(b.title) && normalise(a.author) === normalise(b.author)

// Books without a work key (added by hand, or before keys were stored) fall back to title + author.
export function sameBook(a: Comparable, b: Comparable) {
  if (a.workKey && b.workKey) return a.workKey === b.workKey
  return normalise(a.title) === normalise(b.title) && normalise(a.author) === normalise(b.author)
}

// A catalogue Work's id (a 24-character ObjectId), which stands in for the work key on the page of a
// book Open Library doesn't have (one added from a Hardcover search hit).
const CATALOGUE_ID = /^[0-9a-f]{24}$/

export const normaliseCatalogueId = (id?: string | null) => (id && CATALOGUE_ID.test(id) ? id : null)

// What a book page and its APIs (reader counts, reviews, tags) are keyed by: the Open Library work
// key, else a catalogue Work id.
export const normaliseBookKey = (key?: string | null) => normaliseWorkKey(key) ?? normaliseCatalogueId(key)

// Book pages (/books/OL45883W-dune) are keyed by the Open Library work key; the title after it is
// only for people and search engines, and a stale one redirects to the current. A book Open Library
// lacks but the catalogue knows from Hardcover has its page under the Work's id instead
// (/books/6720c0ffee0123456789abcd-gilded-rose). Books added by hand have no page.
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

export const bookSlug = (bookKey: string, title: string) => [bookKey, titleSlug(title)].filter(Boolean).join("-")

// The page key in a slug: "OL45883W-dune" -> "OL45883W", "6720c0ffee0123456789abcd-gilded-rose" -> the id.
export function bookKeyOfSlug(slug: string) {
  return normaliseWorkKey(slug) ?? normaliseCatalogueId(slug.match(/^([0-9a-f]{24})(?:-|$)/)?.[1])
}

// A book's page key. `pageWorkId` is the catalogue Work a book without a work key has its page under;
// whoever sets it has checked the Work has a page (apps/web/lib/bookPage.ts hasPageWhere).
export const bookKeyOf = (book: { workKey?: string | null, pageWorkId?: string | null }) =>
  normaliseWorkKey(book.workKey) ?? normaliseCatalogueId(book.pageWorkId)

export function bookHref(book: { workKey?: string | null, pageWorkId?: string | null, title: string }) {
  const key = bookKeyOf(book)
  return key ? `/books/${encodeURIComponent(bookSlug(key, book.title))}` : null
}
