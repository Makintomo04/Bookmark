// Author names are free text on a reader's copy ("Colleen Hoover", "Hoover, Colleen", "Neil Gaiman &
// Terry Pratchett"), so author pages are keyed by a slug of the name rather than an id. Shared so the web
// and mobile apps link the same names to the same pages.

// Credits that aren't a person: a page for them would gather unrelated books.
const PLACEHOLDERS = new Set(["unknown", "unknown-author", "anonymous", "anon", "various", "various-authors", "n-a", "na"])

// "Hoover, Colleen" -> "Colleen Hoover". Only a single comma with a word or two either side, so a
// suffix ("Martin Luther King, Jr.") or a list of names is left alone.
function uninvert(name: string) {
  const parts = name.split(",").map((s) => s.trim())
  if (parts.length !== 2 || !parts[0] || !parts[1]) return name
  if (/^(jr|sr|ii|iii|iv|phd|md)\.?$/i.test(parts[1])) return name
  if (parts[0].split(/\s+/).length > 2 || parts[1].split(/\s+/).length > 3) return name
  return `${parts[1]} ${parts[0]}`
}

// The people in a credit: "Neil Gaiman & Terry Pratchett" -> both. Commas aren't split on, as above.
export function authorNames(raw?: string | null): string[] {
  return (raw ?? "")
    .split(/\s*(?:&|;|\/|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

// "J. R. R. Tolkien" -> "j-r-r-tolkien", "Gabriel García Márquez" -> "gabriel-garcia-marquez". Letters in
// any script survive ("村上春樹", "фёдор-достоевский"), so only names with no letters or digits come out empty.
export function authorSlug(name: string) {
  return uninvert(name)
    .normalize("NFKD")
    // Accents off Latin letters only: in other scripts (Devanagari vowel signs, Cyrillic й) marks are spelling.
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}

export function isLinkableAuthor(name: string) {
  const slug = authorSlug(name)
  return !!slug && !PLACEHOLDERS.has(slug)
}

export const authorHref = (name: string) => `/authors/${encodeURIComponent(authorSlug(name))}`

// The words of a slug, for searching by name when we only have the URL: "j-r-r-tolkien" -> "j r r tolkien".
export const slugWords = (slug: string) => slug.replace(/-+/g, " ").trim()

// Whether a credit (possibly joint) includes this author.
export const creditIncludes = (credit: string | null | undefined, slug: string) =>
  authorNames(credit).some((name) => authorSlug(name) === slug)
