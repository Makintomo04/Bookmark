// The rules for a librarian's correction to the shared catalogue (Work and Edition), kept pure so
// scripts/test/catalogueFix.test.ts can check them. lib/catalogueFix.ts applies them.
//
// A fix changes the catalogue row, then carries over to readers' own copies (Book) and list snapshots
// (ListItem):
//   - title, author and pages only where the copy still shows exactly what the catalogue showed before,
//     so a reader who typed their own keeps it;
//   - the cover on every copy showing a catalogue cover, whatever its URL. Covers are copied to our own
//     storage (lib/covers.ts mirrorCover), so a copy of the wrong cover rarely has the old URL. Only a
//     reader's own upload is kept (lib/uploads.ts); the caller filters those out.

export const WORK_FIELDS = ["title", "authors", "description", "coverUrl"] as const

type CoverRow = { coverUrl: string | null, curatedFields?: string[] }

// The cover a librarian set: the work's, else one of these editions'. It beats every other source
// (Open Library, Hardcover, a search hit's cover), which otherwise fill in a cover that's missing.
export const librarianCover = (work: CoverRow, editions: CoverRow[]) =>
  [work, ...editions].find((row) => row.coverUrl && row.curatedFields?.includes("coverUrl"))?.coverUrl ?? null
export const EDITION_FIELDS = ["pages", "coverUrl"] as const
export type WorkField = (typeof WORK_FIELDS)[number]
export type EditionField = (typeof EDITION_FIELDS)[number]

export const TITLE_MAX = 300
export const AUTHOR_MAX = 200
export const AUTHORS_MAX = 10
export const PAGES_MAX = 20000

export interface WorkValues {
  title: string
  authors: string[]
  description: string | null
  coverUrl: string | null
}

export interface EditionValues {
  pages: number | null
  coverUrl: string | null
}

type Parsed<T> = { ok: true; patch: Partial<T> } | { ok: false; error: string }

const isHttps = (url: string) => {
  try {
    return new URL(url).protocol === "https:"
  } catch {
    return false
  }
}

function coverOf(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === "") return { ok: true, value: null }
  if (typeof raw !== "string" || !isHttps(raw.trim())) return { ok: false, error: "The cover needs to be an https image link." }
  return { ok: true, value: raw.trim() }
}

// Only the fields sent are changed; anything else in the body is ignored.
export function parseWorkFix(body: Record<string, unknown>, descriptionMax: number): Parsed<WorkValues> {
  const patch: Partial<WorkValues> = {}
  if ("title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title) return { ok: false, error: "A book needs a title." }
    patch.title = title.slice(0, TITLE_MAX)
  }
  if ("authors" in body) {
    const list = Array.isArray(body.authors) ? body.authors : typeof body.authors === "string" ? body.authors.split(",") : null
    const authors = (list ?? []).filter((a): a is string => typeof a === "string").map((a) => a.trim().slice(0, AUTHOR_MAX)).filter(Boolean).slice(0, AUTHORS_MAX)
    if (!authors.length) return { ok: false, error: "Add at least one author." }
    patch.authors = authors
  }
  if ("description" in body) {
    const description = typeof body.description === "string" ? body.description.trim() : ""
    patch.description = description ? description.slice(0, descriptionMax) : null
  }
  if ("coverUrl" in body) {
    const cover = coverOf(body.coverUrl)
    if (!cover.ok) return cover
    patch.coverUrl = cover.value
  }
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to change." }
  return { ok: true, patch }
}

export function parseEditionFix(body: Record<string, unknown>): Parsed<EditionValues> {
  const patch: Partial<EditionValues> = {}
  if ("pages" in body) {
    const pages = body.pages === null || body.pages === "" ? null : Number(body.pages)
    if (pages !== null && (!Number.isInteger(pages) || pages < 1 || pages > PAGES_MAX)) return { ok: false, error: "Pages needs to be a whole number." }
    patch.pages = pages
  }
  if ("coverUrl" in body) {
    const cover = coverOf(body.coverUrl)
    if (!cover.ok) return cover
    patch.coverUrl = cover.value
  }
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to change." }
  return { ok: true, patch }
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

// The fields the patch really changes, so an unchanged field isn't marked curated or carried over.
export function changedFields<T extends object>(before: T, patch: Partial<T>): (keyof T)[] {
  return (Object.keys(patch) as (keyof T)[]).filter((k) => {
    const was = before[k]
    const now = patch[k]
    if (Array.isArray(was) && Array.isArray(now)) return !sameList(was, now)
    return (was ?? null) !== (now ?? null)
  })
}

// One update: copies whose `field` still equals one of `from` take `to`. `from: "catalogue"` is any
// value but a reader's own upload; `from: "any"` is any value at all.
export interface CopyUpdate {
  model: "book" | "listItem" | "circle"
  field: "title" | "author" | "coverImage" | "coverUrl" | "pages" | "description"
  from: (string | number)[] | "catalogue" | "any"
  to: string | number | null
}

// How readers' copies write a work's authors: Book.author and ListItem.author are one string.
export const authorStrings = (authors: string[]) => Array.from(new Set([authors.join(", "), authors[0]].filter(Boolean)))

// The copy updates for a work fix. Book rows are matched on workId, list items and reading circles on the
// Open Library work key, by the caller. A cleared field (no new value) isn't carried over: an empty cover
// beats none, and an empty description leaves readers the blurb they had. A reader can't write their
// copy's description (it's whichever blurb was about when they shelved it), so a new one replaces all.
export function workCopyUpdates(before: WorkValues, patch: Partial<WorkValues>): CopyUpdate[] {
  const out: CopyUpdate[] = []
  const changed = changedFields(before, patch)
  if (changed.includes("title") && patch.title && before.title) {
    out.push({ model: "book", field: "title", from: [before.title], to: patch.title })
    out.push({ model: "listItem", field: "title", from: [before.title], to: patch.title })
    out.push({ model: "circle", field: "title", from: [before.title], to: patch.title })
  }
  if (changed.includes("authors") && patch.authors?.length && before.authors.length) {
    const from = authorStrings(before.authors)
    const to = patch.authors.join(", ")
    out.push({ model: "book", field: "author", from, to })
    out.push({ model: "listItem", field: "author", from, to })
    out.push({ model: "circle", field: "author", from, to })
  }
  if (changed.includes("coverUrl") && patch.coverUrl) {
    out.push({ model: "book", field: "coverImage", from: "catalogue", to: patch.coverUrl })
    out.push({ model: "listItem", field: "coverUrl", from: "catalogue", to: patch.coverUrl })
    out.push({ model: "circle", field: "coverImage", from: "catalogue", to: patch.coverUrl })
  }
  if (changed.includes("description") && patch.description) {
    out.push({ model: "book", field: "description", from: "any", to: patch.description })
  }
  return out
}

// For an edition fix: Book rows on that editionId. List items don't record an edition.
export function editionCopyUpdates(before: EditionValues, patch: Partial<EditionValues>): CopyUpdate[] {
  const out: CopyUpdate[] = []
  const changed = changedFields(before, patch)
  if (changed.includes("coverUrl") && patch.coverUrl) {
    out.push({ model: "book", field: "coverImage", from: "catalogue", to: patch.coverUrl })
  }
  if (changed.includes("pages") && patch.pages && before.pages) {
    out.push({ model: "book", field: "pages", from: [before.pages], to: patch.pages })
  }
  return out
}

// curatedFields after a fix: what was curated before plus what this fix changed.
export const mergeCurated = (current: string[] | null | undefined, changed: string[]) => Array.from(new Set([...(current ?? []), ...changed]))
