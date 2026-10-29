// Reading progress in either unit: pages (the default) or minutes listened, for audiobooks.
// Everything that turns a book's position into a percent, a label or a scale goes through here, so
// stats, Wrapped, the goal, circles and the cards all agree. No database or "@/" imports: plain Node
// loads this for scripts/check-buddy-read-spoilers.ts and scripts/test/progress.test.ts.

export type ProgressUnit = "PAGES" | "MINUTES"

// The fields progress is worked out from. Book and BookRead both carry them; the optional ones are
// unset on rows made before audiobooks existed, which are all in pages.
export type ProgressBook = {
  status: string
  currentPage: number | null
  pages: number
  progressUnit?: ProgressUnit | null
  currentMinute?: number | null
  audioMinutes?: number | null
  // The exact percent a Kindle reader typed, when they logged one; null once they log a page or minute.
  currentPercent?: number | null
  // The reader's per-book choice to log in percent.
  logsPercent?: boolean | null
  // Chapters and Kindle locations: more ways of entering a place, stored as a percent (see entryOf below).
  chapters?: number | null
  currentChapter?: number | null
  locations?: number | null
  currentLocation?: number | null
  logsIn?: ProgressEntry | null
}

// How a reader logs one book. Percent, chapters and Kindle locations all store a percent (currentPercent,
// with the matching page or minute beside it), so stats, goals and circles never need to know which.
export type ProgressEntry = "PAGES" | "PERCENT" | "CHAPTERS" | "LOCATION"

// Prisma `select` for anything that calls progressPercent(): spread it, don't list the fields again.
export const progressSelect = {
  status: true,
  currentPage: true,
  pages: true,
  progressUnit: true,
  currentMinute: true,
  audioMinutes: true,
  currentPercent: true,
  logsPercent: true,
} as const

// A book runs on minutes only when it says so and its running time is known; otherwise pages, even
// if that count is 0 (then nothing can be tracked, and progress is 0 until the reader fixes it).
export function unitOf(book: Partial<Pick<ProgressBook, "progressUnit" | "audioMinutes">> | null | undefined): ProgressUnit {
  if (!book) return "PAGES"
  return book.progressUnit === "MINUTES" && (book.audioMinutes ?? 0) > 0 ? "MINUTES" : "PAGES"
}

export type ProgressScale = { unit: ProgressUnit, current: number, total: number }

// Where the reader is on the book's own scale: page 120 of 300, or minute 95 of 724.
export function progressScale(book: ProgressBook | null | undefined): ProgressScale {
  if (!book) return { unit: "PAGES", current: 0, total: 0 }
  const unit = unitOf(book)
  const total = Math.max(0, unit === "MINUTES" ? book.audioMinutes ?? 0 : book.pages ?? 0)
  const raw = unit === "MINUTES" ? book.currentMinute ?? 0 : book.currentPage ?? 0
  const current = total > 0 ? Math.max(0, Math.min(total, raw)) : Math.max(0, raw)
  return { unit, current, total }
}

export const roundPercent = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10

// Members of a circle may own different editions (or listen while others read), so progress is a
// percent of their own book. A finished book is 100 whatever its count says. A percent the reader
// typed wins over current/total, so a book with no page count still moves, and 37% of a short book
// doesn't drift to 38% by way of a rounded page. One decimal place is plenty and keeps JSON short.
export function progressPercent(book: ProgressBook | null | undefined): number {
  if (!book) return 0
  if (book.status === "COMPLETED") return 100
  if (book.currentPercent != null) return roundPercent(book.currentPercent)
  const { current, total } = progressScale(book)
  if (!(total > 0)) return 0
  return roundPercent((current / total) * 100)
}

// Whole-number percent for bars and cards.
export const progressWhole = (book: ProgressBook | null | undefined) => Math.round(progressPercent(book))

// 95 → "1h 35m", 60 → "1h", 20 → "20m", 0 → "0m".
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`
}

// ---- Logging in percent ----------------------------------------------------------------------
// Kindle shows "37%", not a page. Percent is a way of entering progress, not a unit: the book stays in
// pages (or minutes), and the matching position is stored beside the percent whenever the length is known.

// Whether the update modal opens in percent: the reader chose it for this book, or there's no length
// to log a page against.
export function entersPercent(book: ProgressBook | null | undefined): boolean {
  if (!book) return false
  return !!book.logsPercent || !(progressScale(book).total > 0)
}

// 37% of 300 pages → page 111. Rounded, and kept within the book.
export function percentToPosition(percent: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(percent)) return 0
  return Math.max(0, Math.min(total, Math.round((percent / 100) * total)))
}

// Quick-add buttons in percent mode.
export const PERCENT_QUICK_ADDS = [1, 5, 10]

// Kindle back matter (acknowledgements, a preview of the next book) often starts around here, so the
// modal offers to mark the book as finished from this point.
export const NEARLY_FINISHED_PERCENT = 97

const percentLabel = (n: number) => `${Math.round(n)}%`

// "Page 120 of 300" or "1h 35m of 12h 4m", for the cards and the update modal. A place logged in
// percent leads with it: "37% · page 111 of 300", or just "37%" when there's no length. Cards that
// already show the percent beside it pass `percent: false`, and get the page (or "No page count").
export function formatPosition(book: ProgressBook | null | undefined, opts: { paused?: boolean, percent?: boolean } = {}): string {
  const { unit, current, total } = progressScale(book)
  const paused = opts.paused ? "Paused at " : ""
  // With no length there's no page to show, only the percent (0% until one is logged).
  if (!(total > 0)) return opts.percent === false ? "No page count" : `${paused}${percentLabel(progressPercent(book))}`
  if (book && book.currentPercent != null) {
    const pct = percentLabel(progressPercent(book))
    if (opts.percent !== false) {
      const where = unit === "MINUTES" ? `${formatMinutes(current)} of ${formatMinutes(total)}` : `page ${current} of ${total}`
      return `${paused}${pct} · ${where}`
    }
  }
  if (unit === "MINUTES") return `${formatMinutes(current)} of ${formatMinutes(total)}${opts.paused ? " · paused" : ""}`
  return `${opts.paused ? "Paused on page" : "Page"} ${current} of ${total}`
}

// ---- Chapters and Kindle locations ------------------------------------------------------------

// How this book is logged: the reader's choice, or percent for a book set to log in percent before
// chapters and locations existed, or pages. Chapters and locations need their totals to mean anything.
export function entryOf(book: ProgressBook | null | undefined): ProgressEntry {
  if (!book) return "PAGES"
  if (book.logsIn === "CHAPTERS" && (book.chapters ?? 0) > 0) return "CHAPTERS"
  if (book.logsIn === "LOCATION" && (book.locations ?? 0) > 0) return "LOCATION"
  if (book.logsIn === "PERCENT" || book.logsPercent) return "PERCENT"
  return "PAGES"
}

// The chapter a percent falls in, of a book with `chapters` chapters: 0% is chapter 1, 100% the last. It's
// how a circle's place reads in chapters across members' different editions: by how far through, not by page.
export function chapterAt(percent: number, chapters: number): number {
  if (!(chapters > 0) || !Number.isFinite(percent)) return 0
  return Math.max(1, Math.min(chapters, Math.ceil((Math.max(0, Math.min(100, percent)) / 100) * chapters)))
}

// A chapter or location as a percent: chapter 9 of 14 is the end of chapter 8 (finished chapters), so
// logging "Ch 9" says you've started it. Location 2,310 of 5,120 is simply its share.
export function chapterPercent(chapter: number, chapters: number): number {
  if (!(chapters > 0)) return 0
  return roundPercent(((Math.max(1, Math.min(chapters, chapter)) - 1) / chapters) * 100)
}
export function locationPercent(location: number, locations: number): number {
  if (!(locations > 0)) return 0
  return roundPercent((Math.max(0, Math.min(locations, location)) / locations) * 100)
}

// The place in the way the reader logs it, when that's chapters or locations: "Ch 9 of 14", "Loc 2,310 of
// 5,120". Null for pages, minutes and percent, which formatPosition says.
export function formatEntry(book: ProgressBook | null | undefined): string | null {
  const entry = entryOf(book)
  if (!book || book.status === "COMPLETED") return null
  if (entry === "CHAPTERS") return `Ch ${book.currentChapter || chapterAt(progressPercent(book), book.chapters!)} of ${book.chapters}`
  if (entry === "LOCATION") return `Loc ${(book.currentLocation ?? 0).toLocaleString("en-GB")} of ${book.locations!.toLocaleString("en-GB")}`
  return null
}

// "Stopped at page 40" / "Stopped at 1h 10m".
export function formatStoppedAt(book: ProgressBook | null | undefined): string {
  const { unit, current, total } = progressScale(book)
  if (book && book.currentPercent != null && !(total > 0)) return `Stopped at ${percentLabel(book.currentPercent)}`
  return unit === "MINUTES" ? `Stopped at ${formatMinutes(current)}` : `Stopped at page ${current}`
}

// A book's length on its own scale: "300 pages" or "12h 4m".
export function formatLength(book: (Pick<ProgressBook, "pages"> & Partial<Pick<ProgressBook, "progressUnit" | "audioMinutes">>) | null | undefined): string | null {
  if (!book) return null
  if (unitOf(book) === "MINUTES") return formatMinutes(book.audioMinutes ?? 0)
  return book.pages > 0 ? `${book.pages} pages` : null
}

// Switching a book from pages to minutes (or back) keeps the reader's place as a percent, so a
// circle doesn't see them jump to 0.
export function convertPosition(current: number, fromTotal: number, toTotal: number): number {
  if (!(fromTotal > 0) || !(toTotal > 0)) return 0
  return Math.max(0, Math.min(toTotal, Math.round((current / fromTotal) * toTotal)))
}

// ---- A read's own length ---------------------------------------------------------------------
// An ended read keeps the format and length it was read in, so re-listening to a book first read in
// print doesn't turn the print read into minutes. Book and BookRead both carry these fields.

export type LengthFields = {
  pages?: number | null
  progressUnit?: ProgressUnit | null
  audioMinutes?: number | null
}

// What an ended read stores: the book's scale as it is now.
export function lengthSnapshot(book: LengthFields & { pages: number }) {
  const unit = unitOf(book)
  return { pages: Math.max(0, book.pages), progressUnit: unit, audioMinutes: unit === "MINUTES" ? book.audioMinutes ?? null : null }
}

// What one finish adds to the totals: its pages if read on paper or screen, its running time if
// listened to, never both. A read with no length of its own (it ended before reads kept one) follows the book.
export function readLength(read: LengthFields, book: LengthFields & { pages: number }): { pages: number, minutes: number } {
  const from = read.pages != null ? read : book
  return unitOf(from) === "MINUTES"
    ? { pages: 0, minutes: from.audioMinutes ?? 0 }
    : { pages: Math.max(0, from.pages ?? 0), minutes: 0 }
}

type EndedRead = LengthFields & { id: string }

// Editing a book's format or length, as the updates its ended reads need. The reads of the book as it
// was (no length of their own yet, or the same format and length) are that edition: a fix within the
// same format reaches them, while a switch of format leaves them as they were read. Reads of another
// edition keep their own.
export function readLengthsAfterEdit(reads: EndedRead[], before: LengthFields & { pages: number }, after: LengthFields & { pages: number }) {
  const was = lengthSnapshot(before)
  const now = lengthSnapshot(after)
  const length = (s: { progressUnit: ProgressUnit, pages: number | null, audioMinutes: number | null }) => (s.progressUnit === "MINUTES" ? s.audioMinutes : s.pages)
  const sameEdition = (r: EndedRead) => r.pages == null
    || (unitOf(r) === was.progressUnit && length({ progressUnit: unitOf(r), pages: r.pages ?? null, audioMinutes: r.audioMinutes ?? null }) === length(was))
  const data = was.progressUnit === now.progressUnit ? now : was
  const differs = (r: EndedRead) => r.pages !== data.pages || r.progressUnit !== data.progressUnit || (r.audioMinutes ?? null) !== data.audioMinutes
  return reads.filter((r) => sameEdition(r) && differs(r)).map((r) => ({ id: r.id, data }))
}

// Quick-add buttons: a few pages, or a quarter-hour to an hour of listening.
export const QUICK_ADDS: Record<ProgressUnit, number[]> = { PAGES: [10, 25, 50], MINUTES: [15, 30, 60] }
