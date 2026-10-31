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

import { releaseDateFrom, releaseYear } from "@bookmark/shared/releases"

export const WORK_FIELDS = ["title", "authors", "description", "coverUrl", "seriesName", "seriesPosition", "firstPublishYear", "releaseDate"] as const

type CoverRow = { coverUrl: string | null, curatedFields?: string[] }

// The cover a librarian set: the work's, else one of these editions'. It beats every other source
// (Open Library, Hardcover, a search hit's cover), which otherwise fill in a cover that's missing.
export const librarianCover = (work: CoverRow, editions: CoverRow[]) =>
  [work, ...editions].find((row) => row.coverUrl && row.curatedFields?.includes("coverUrl"))?.coverUrl ?? null
export const EDITION_FIELDS = ["pages", "coverUrl", "isbn13", "isbn10", "publisher", "publishedYear", "format"] as const
// Edition.format in schema.prisma.
export const EDITION_FORMATS = ["PAPERBACK", "HARDCOVER", "EBOOK", "AUDIOBOOK"] as const
export type EditionFormatValue = (typeof EDITION_FORMATS)[number]
export type WorkField = (typeof WORK_FIELDS)[number]
export type EditionField = (typeof EDITION_FIELDS)[number]

export const TITLE_MAX = 300
export const AUTHOR_MAX = 200
export const AUTHORS_MAX = 10
export const PAGES_MAX = 20000
export const SERIES_NAME_MAX = 200
export const SERIES_POSITION_MAX = 1000
export const PUBLISHER_MAX = 200
// From the oldest written works (negative is BC) to a book announced for a few years ahead.
export const YEAR_MIN = -3000
export const yearMax = () => new Date().getFullYear() + 5

export interface WorkValues {
  title: string
  authors: string[]
  description: string | null
  coverUrl: string | null
  seriesName: string | null
  // 1, 2, 2.5…
  seriesPosition: number | null
  firstPublishYear: number | null
  // "YYYY-MM-DD": the day it first came out, or comes out (Work.releaseDate). A librarian's date is kept over
  // Hardcover's (lib/authorNews.ts), so a self-published book Hardcover doesn't list can still have one.
  releaseDate: string | null
}

export interface EditionValues {
  pages: number | null
  coverUrl: string | null
  isbn13: string | null
  isbn10: string | null
  publisher: string | null
  publishedYear: number | null
  format: EditionFormatValue | null
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
  if ("seriesName" in body) {
    const name = typeof body.seriesName === "string" ? body.seriesName.trim() : ""
    patch.seriesName = name ? name.slice(0, SERIES_NAME_MAX) : null
  }
  if ("seriesPosition" in body) {
    const position = body.seriesPosition === null || body.seriesPosition === "" ? null : Number(body.seriesPosition)
    if (position !== null && (!Number.isFinite(position) || position < 0 || position > SERIES_POSITION_MAX)) return { ok: false, error: "The place in the series needs to be a number, like 1 or 2.5." }
    patch.seriesPosition = position
  }
  if ("firstPublishYear" in body) {
    const year = yearOf(body.firstPublishYear)
    if (!year.ok) return { ok: false, error: "The first publication year needs to be a year, like 1965." }
    patch.firstPublishYear = year.value
  }
  if ("releaseDate" in body) {
    const raw = typeof body.releaseDate === "string" ? body.releaseDate.trim() : body.releaseDate
    const date = raw === null || raw === "" ? null : typeof raw === "string" ? releaseDateFrom(raw) : null
    if (raw !== null && raw !== "" && !date) return { ok: false, error: "The release date needs to be a full date, like 2027-04-09 or 9 April 2027." }
    if (date && (releaseYear(date) < 1000 || releaseYear(date) > yearMax())) return { ok: false, error: `The release date needs to be before ${yearMax() + 1}.` }
    // The first year follows the date, so publication day doesn't take it for a reissue (lib/releaseRules.ts).
    if (date && "firstPublishYear" in body && patch.firstPublishYear != null && patch.firstPublishYear !== releaseYear(date)) {
      return { ok: false, error: "The release date and the first publication year disagree." }
    }
    patch.releaseDate = date
    if (date && !("firstPublishYear" in body)) patch.firstPublishYear = releaseYear(date)
  }
  // Out of a series means no place in one.
  if (patch.seriesName === null) patch.seriesPosition = null
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to change." }
  return { ok: true, patch }
}

// curatedFields for a work fix's changed fields. A librarian's series is one thing: touching either half
// marks both, so a series with no number, or a number cleared, isn't refilled from an import. seriesName is
// what keeps the Hardcover series fill (lib/seriesFill.ts SERIES_CURATED) off it.
export const curatedWorkFields = (changed: string[]) =>
  changed.some((k) => k === "seriesName" || k === "seriesPosition") ? Array.from(new Set([...changed, "seriesName", "seriesPosition"])) : changed

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
  if ("isbn13" in body) {
    const isbn = normaliseIsbn(body.isbn13, 13)
    if (!isbn.ok) return { ok: false, error: "That ISBN-13 doesn't add up. Check the digits: the last one is a check digit." }
    patch.isbn13 = isbn.value
  }
  if ("isbn10" in body) {
    const isbn = normaliseIsbn(body.isbn10, 10)
    if (!isbn.ok) return { ok: false, error: "That ISBN-10 doesn't add up. Check the digits: the last one (0–9 or X) is a check digit." }
    patch.isbn10 = isbn.value
  }
  if ("publisher" in body) {
    const publisher = typeof body.publisher === "string" ? body.publisher.trim() : ""
    patch.publisher = publisher ? publisher.slice(0, PUBLISHER_MAX) : null
  }
  if ("publishedYear" in body) {
    const year = yearOf(body.publishedYear)
    if (!year.ok) return { ok: false, error: "The publication year needs to be a year, like 2019." }
    patch.publishedYear = year.value
  }
  if ("format" in body) {
    const format = body.format === null || body.format === "" ? null : typeof body.format === "string" ? body.format.trim().toUpperCase() : undefined
    if (format !== null && !(EDITION_FORMATS as readonly unknown[]).includes(format)) return { ok: false, error: "Choose paperback, hardcover, ebook or audiobook." }
    patch.format = format as EditionFormatValue | null
  }
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to change." }
  return { ok: true, patch }
}

function yearOf(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw === "") return { ok: true, value: null }
  const year = typeof raw === "string" ? Number(raw.trim()) : raw
  if (typeof year !== "number" || !Number.isInteger(year) || year === 0 || year < YEAR_MIN || year > yearMax()) return { ok: false }
  return { ok: true, value: year }
}

// An ISBN as the catalogue stores it: digits only (and a final X on an ISBN-10), no hyphens or spaces,
// with a check digit that adds up. Empty clears it.
export function normaliseIsbn(raw: unknown, length: 10 | 13): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== "string") return { ok: false }
  const isbn = raw.replace(/[\s-]/g, "").toUpperCase()
  if (!isbn) return { ok: true, value: null }
  if (length === 13) {
    if (!/^\d{13}$/.test(isbn)) return { ok: false }
    const sum = Array.from(isbn).reduce((total, d, i) => total + Number(d) * (i % 2 ? 3 : 1), 0)
    return sum % 10 === 0 ? { ok: true, value: isbn } : { ok: false }
  }
  if (!/^\d{9}[\dX]$/.test(isbn)) return { ok: false }
  const sum = Array.from(isbn).reduce((total, d, i) => total + (d === "X" ? 10 : Number(d)) * (10 - i), 0)
  return sum % 11 === 0 ? { ok: true, value: isbn } : { ok: false }
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
// A revert is the exception: the value being undone was wrong, so copies still holding exactly that value
// go back to empty with the work.
export function workCopyUpdates(before: WorkValues, patch: Partial<WorkValues>, opts: { revert?: boolean } = {}): CopyUpdate[] {
  const out: CopyUpdate[] = []
  const changed = changedFields(before, patch)
  if (opts.revert && changed.includes("coverUrl") && !patch.coverUrl && before.coverUrl) {
    // Book.coverImage can't be null; "" is how a copy says it has no cover (lib/bookSearch.ts).
    out.push({ model: "book", field: "coverImage", from: [before.coverUrl], to: "" })
    out.push({ model: "listItem", field: "coverUrl", from: [before.coverUrl], to: null })
    out.push({ model: "circle", field: "coverImage", from: [before.coverUrl], to: null })
  }
  if (opts.revert && changed.includes("description") && !patch.description && before.description) {
    out.push({ model: "book", field: "description", from: [before.description], to: null })
  }
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
export function editionCopyUpdates(before: Pick<EditionValues, "pages" | "coverUrl">, patch: Partial<EditionValues>): CopyUpdate[] {
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

// ---- History and revert -----------------------------------------------------------------------
//
// work.edit and edition.edit log the changed fields' old values as `before` and the new ones as `after`
// (lib/catalogueFix.ts), with bookkeeping alongside in `after`: how many copies followed, how many reports
// the fix closed and which (reportIds), which changed fields were corrected already (wasCurated), and for a
// revert the action it undid. Reverting puts `before` back. Older entries have no reportIds or wasCurated.

const BOOKKEEPING = new Set(["copies", "reports", "reportIds", "wasCurated", "reverts", "reopened"])

export const FIELD_LABELS: Record<string, string> = {
  title: "Title", authors: "Authors", description: "Description", coverUrl: "Cover", seriesName: "Series",
  seriesPosition: "Number in series", firstPublishYear: "First published", releaseDate: "Release date", pages: "Pages", isbn13: "ISBN-13",
  isbn10: "ISBN-10", publisher: "Publisher", publishedYear: "Published", format: "Format",
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {})

// The same value as the log stores it: lists item by item, and unset the same as null.
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]))
  return (a ?? null) === (b ?? null)
}

export interface FieldChange { field: string; from: unknown; to: unknown }

// A logged edit field by field, for the book's history in the work editor.
export function fieldChanges(before: unknown, after: unknown): FieldChange[] {
  const was = asRecord(before)
  const now = asRecord(after)
  const fields = Array.from(new Set([...Object.keys(was), ...Object.keys(now)])).filter((k) => !BOOKKEEPING.has(k))
  return fields.map((field) => ({ field, from: was[field] ?? null, to: now[field] ?? null }))
}

export type RevertPlan =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; conflicts: string[] }

// What undoing a logged edit puts back: each field's old value, but only while every field still shows
// what the edit set. If anyone has changed one since, nothing goes back and `conflicts` names them, so a
// later fix is never silently undone. An entry with no editable fields has nothing to undo (empty patch).
export function revertPlan(current: object, before: unknown, after: unknown, allowed: readonly string[]): RevertPlan {
  const was = asRecord(before)
  const now = asRecord(after)
  const fields = Object.keys(was).filter((k) => allowed.includes(k) && k in now)
  const conflicts = fields.filter((k) => !sameValue((current as Record<string, unknown>)[k], now[k]))
  if (conflicts.length) return { ok: false, conflicts }
  return { ok: true, patch: Object.fromEntries(fields.map((k) => [k, was[k] ?? null])) }
}

// curatedFields after a revert. A reverted field goes back to the value from before the edit, so it's no
// longer a librarian's correction unless it was one before the edit too (`wasCurated`, logged with the edit).
// An older entry didn't log that, so its fields stay marked: refilling a corrected field is the worse mistake.
export function curatedAfterRevert(current: string[], reverted: string[], wasCurated: unknown): string[] {
  const merged = mergeCurated(current, reverted)
  if (!Array.isArray(wasCurated)) return merged
  return merged.filter((f) => !reverted.includes(f) || wasCurated.includes(f))
}

// The report ids a logged work fix closed (`after.reportIds`), for its revert to reopen.
export const closedReportIds = (after: unknown): string[] => {
  const list = asRecord(after).reportIds
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : []
}
