import type { DiscoverBook } from "./openLibrary"
import { workMatchKey } from "./catalog/normalise.ts"

// Open Library often holds one book as several works, sometimes under two author records with the same
// name ("United States History" by Emma J. Lapsansky-Werner is five). Search results and genre lists mix
// authors, so copies are matched on first author and title together: another author's book with the same
// title stays. Pure, so scripts/test/workDuplicates.test.ts runs it; lib/openLibrary.ts does the fetching.

// "Unknown" is what lib/openLibrary.ts calls a work with no author, which says nothing about the book.
const bookKey = (book: Pick<DiscoverBook, "workKey" | "title" | "author">) =>
  book.workKey && book.author !== "Unknown" ? workMatchKey(book.title, book.author) : null

// The copies of each book that appears more than once, as lists of work keys in list order. A book without
// a work key (a Hardcover result) is never a copy.
export function duplicateGroups(books: Pick<DiscoverBook, "workKey" | "title" | "author">[]): string[][] {
  const groups = new Map<string, string[]>()
  for (const book of books) {
    const key = bookKey(book)
    if (!key) continue
    const group = groups.get(key)
    if (!group) groups.set(key, [book.workKey!])
    else if (!group.includes(book.workKey!)) group.push(book.workKey!)
  }
  return Array.from(groups.values()).filter((g) => g.length > 1)
}

// How much a copy brings: a description first (the book page shows it, and it's fetched by work key, so
// it can't be borrowed from another copy), then pages, a cover, ISBNs and a year, then editions.
function score(book: DiscoverBook, described: Set<string>) {
  const fields = [book.pages, book.coverUrl, book.isbn13 || book.isbn10, book.year].filter(Boolean).length
  return [book.workKey && described.has(book.workKey) ? 1 : 0, fields, book.editionCount ?? 0]
}

function better(a: DiscoverBook, b: DiscoverBook, described: Set<string>) {
  const [sa, sb] = [score(a, described), score(b, described)]
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i]
  return false
}

// One card per book: the copy with the most data, in the place of the copy listed first, so the ranking
// holds. It borrows pages, year and cover from the dropped copies when it has none; not ISBNs or the
// edition key, which would add a different work's edition. `described` holds the work keys known to have
// a description.
export function collapseDuplicates<T extends DiscoverBook>(books: T[], described: Set<string> = new Set()): T[] {
  const keys = books.map(bookKey)
  const copies = new Map<string, T[]>()
  books.forEach((book, i) => {
    const key = keys[i]
    if (key) copies.set(key, [...(copies.get(key) ?? []), book])
  })
  const shown = new Set<string>()
  const out: T[] = []
  books.forEach((book, i) => {
    const key = keys[i]
    if (!key) return void out.push(book)
    if (shown.has(key)) return
    shown.add(key)
    const group = copies.get(key)!
    const kept = group.reduce((best, b) => (better(b, best, described) ? b : best))
    const filled = { ...kept }
    for (const field of ["pages", "year", "coverUrl"] as const) {
      const from = filled[field] ? null : group.find((b) => b[field])
      if (from) Object.assign(filled, { [field]: from[field] })
    }
    out.push(filled)
  })
  return out
}
