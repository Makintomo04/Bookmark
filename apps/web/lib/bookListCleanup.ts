// Tidies a list of one author's books from Open Library before readers see it. Anyone can add records
// there, so an author's list carries the same book several times ("Fourth Wing", "Fourth wing", "Fourth
// Wing (Special Edition)"), translations, box sets, and things that aren't novels (a tarot deck, a
// "Summary of…"). Pure, so scripts/test/bookListCleanup.test.ts runs it, and used for the catalog
// duplicate report (scripts/report-duplicate-works.ts) as well as author pages.

export interface ListBook {
  title: string
  pages?: number | null
  coverUrl?: string | null
  // Open Library language codes ("eng", "spa"); empty or missing when Open Library doesn't say.
  languages?: string[] | null
}

// Edition tags in brackets that don't make a different book.
const EDITION_WORDS = /\b(special|deluxe|collector'?s|anniversary|illustrated|exclusive|signed|limited|hardcover|paperback|edition|ed\.|movie tie-in|tie-in|sprayed edges?|large print|unabridged|abridged)\b/i

// "Hallowed Ground - Flight & Glory #4" -> "hallowed ground"; "Fourth Wing (Special Edition)" -> "fourth
// wing"; "Fourth Wing: A Novel" -> "fourth wing"; "The Reality of Everything" -> "reality of everything".
// Accents, punctuation and a leading article off, so near-copies compare equal.
export function titleKey(title: string): string {
  return title
    .replace(/\s*\(([^)]*)\)\s*/g, (whole, inside: string) => (EDITION_WORDS.test(inside) || /#\s*\d/.test(inside) ? " " : whole))
    .replace(/\s+[-–—:]\s+[^-–—:]*#\s*[\d.]+\s*$/, "")
    .replace(/:\s*a novel\s*$/i, "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(the|a|an) /, "")
}

// The part before a dash, as a key: "Catwoman - Diebin von Gotham City" -> "catwoman". Null without one.
function beforeDash(title: string): string | null {
  const match = title.match(/^(.+?)\s+[-–—]\s+\S/)
  return match ? titleKey(match[1]) : null
}

const BOX_SET = /\b(box(ed)?[\s-]?set|collection set|books? \d+\s*(-|–|to|through)\s*\d+|omnibus|bundle|complete (series|collection|trilogy)|series collection|\d+[- ]books? (collection|set|bundle)|trilogy set)\b/i
// Not a book a reader reads: decks, fan summaries, placeholders, and shop displays ("Emily Henry 24-Copy
// Mixed Floor Display W/Riser"). Words that are also real titles ("The Notebook", "The Journal of Mrs…",
// "Calendar Girl") are deliberately not on it.
const NOT_A_NOVEL = /\b(tarot|colou?ring book|sampler|study guide|workbook|summary of|summary and analysis|untitled|\d+-copy|floor display|counter display|prepack|dump bin)\b/i

export type DropReason = "duplicate" | "translation" | "box set" | "not a novel"

// Why a book would be left out, or null to keep it. `englishAuthor` says the author has English books at
// all, so an author who writes in another language keeps every book. `keys` are the title keys of the
// list's other books, for spotting a bundle that strings two of them together.
export function dropReason(book: ListBook, englishAuthor: boolean, keys: string[]): Exclude<DropReason, "duplicate"> | null {
  if (NOT_A_NOVEL.test(book.title)) return "not a novel"
  if (BOX_SET.test(book.title)) return "box set"
  const key = titleKey(book.title)
  const contained = keys.filter((other) => other !== key && other.length >= 4 && ` ${key} `.includes(` ${other} `))
  if (contained.length >= 2) return "box set"
  // "The Empyrean 5": a bare series name and number with nothing else known is a placeholder record.
  if (!book.pages && !book.coverUrl && /^(the )?[\p{L}']+( [\p{L}']+)? \d+$/iu.test(book.title.trim())) return "not a novel"
  const languages = book.languages ?? []
  if (englishAuthor && languages.length > 0 && !languages.includes("eng")) return "translation"
  return null
}

// The list with those left out, keeping the first of each duplicate (lists come most read first, so the
// copy readers know best stays). "X - something" is a copy of X when X is on the list too: a translated
// subtitle ("Catwoman - Diebin von Gotham City") or a split volume ("… - Part 2"). Order is otherwise unchanged.
export function cleanBookList<T extends ListBook>(books: T[]): T[] {
  const englishAuthor = books.some((b) => (b.languages ?? []).includes("eng"))
  const keys = books.map((b) => titleKey(b.title))
  const all = new Set(keys)
  const seen = new Set<string>()
  return books.filter((book, i) => {
    if (dropReason(book, englishAuthor, keys)) return false
    const prefix = beforeDash(book.title)
    if (prefix && prefix !== keys[i] && all.has(prefix)) return false
    const key = keys[i]
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
