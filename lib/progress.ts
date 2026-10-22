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
}

// Prisma `select` for anything that calls progressPercent(): spread it, don't list the fields again.
export const progressSelect = {
  status: true,
  currentPage: true,
  pages: true,
  progressUnit: true,
  currentMinute: true,
  audioMinutes: true,
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
// percent of their own book. A finished book is 100 whatever its count says. One decimal place is
// plenty and keeps JSON short.
export function progressPercent(book: ProgressBook | null | undefined): number {
  if (!book) return 0
  if (book.status === "COMPLETED") return 100
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

// "Page 120 of 300" or "1h 35m of 12h 4m", for the cards and the update modal.
export function formatPosition(book: ProgressBook | null | undefined, opts: { paused?: boolean } = {}): string {
  const { unit, current, total } = progressScale(book)
  if (unit === "MINUTES") return `${formatMinutes(current)} of ${formatMinutes(total)}${opts.paused ? " · paused" : ""}`
  return `${opts.paused ? "Paused on page" : "Page"} ${current} of ${total}`
}

// "Stopped at page 40" / "Stopped at 1h 10m".
export function formatStoppedAt(book: ProgressBook | null | undefined): string {
  const { unit, current } = progressScale(book)
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
