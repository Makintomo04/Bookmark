import { MONTHS } from "./wrappedCopy"
import { MOOD_LABEL, type Mood } from "./workTags"
import { DEFAULT_TIME_ZONE, isValidTimeZone, localDay } from "./timeZone"

// Wrap cards (BOO-50): the cover grid ("my October in books") and the stats card, for a month or a
// year, in the three shapes people post. The web draws them (app/api/wrap/card); the web's /stats and
// the app's stats screen pick the options. No database or "@/" imports, so both apps and
// scripts/test/wrapCards.test.ts can use this. Every word on a card is written here or in the image
// code by hand: nothing is generated.

// ---- Options ---------------------------------------------------------------------------------

export const CARD_KINDS = ["grid", "stats"] as const
export type CardKind = typeof CARD_KINDS[number]
export const CARD_KIND_LABEL: Record<CardKind, string> = { grid: "Cover grid", stats: "Stats" }

// All 1080 wide, the size Instagram and TikTok keep.
export const CARD_SIZES = {
  story: { width: 1080, height: 1920, label: "9:16", hint: "TikTok, Reels and Stories", short: "Stories" },
  portrait: { width: 1080, height: 1350, label: "4:5", hint: "Instagram post", short: "Post" },
  square: { width: 1080, height: 1080, label: "1:1", hint: "Square post", short: "Square" },
} as const
export type CardSize = keyof typeof CARD_SIZES
export const CARD_SIZE_KEYS = Object.keys(CARD_SIZES) as CardSize[]

// The first design is free for everyone. The others are Plus (entitlements.ts customWrapDesigns).
export const CARD_DESIGNS = {
  midnight: { label: "Midnight", plus: false },
  paper: { label: "Paper", plus: true },
  colour: { label: "Your colour", plus: true },
} as const
export type CardDesign = keyof typeof CARD_DESIGNS
export const CARD_DESIGN_KEYS = Object.keys(CARD_DESIGNS) as CardDesign[]
export const DEFAULT_CARD_DESIGN: CardDesign = "midnight"

const pick = <T extends string>(keys: readonly T[], raw: string | null | undefined, fallback: T): T =>
  keys.includes(raw as T) ? (raw as T) : fallback

export const parseCardKind = (raw: string | null | undefined) => pick(CARD_KINDS, raw, "grid")
export const parseCardSize = (raw: string | null | undefined) => pick(CARD_SIZE_KEYS, raw, "story")
export const parseCardDesign = (raw: string | null | undefined) => pick(CARD_DESIGN_KEYS, raw, DEFAULT_CARD_DESIGN)

// The image's address, for /stats and the app: month is 1 to 12, or null for the whole year.
export function cardPath({ kind, size, design, year, month, hideRatings }: { kind: CardKind; size: CardSize; design: CardDesign; year: number; month: number | null; hideRatings?: boolean }) {
  const q = new URLSearchParams({ kind, size, design, year: String(year) })
  if (month !== null) q.set("month", String(month))
  if (hideRatings) q.set("ratings", "hide")
  return `/api/wrap/card?${q}`
}

// "bookmark-grid-2026-10-story", for the download.
export function cardFileName({ kind, size, year, month }: { kind: CardKind; size: CardSize; year: number; month: number | null }) {
  return `bookmark-${kind}-${year}${month === null ? "" : `-${String(month).padStart(2, "0")}`}-${size}`
}

// ---- Periods ---------------------------------------------------------------------------------

// Today's year and month (1 to 12) in the reader's saved zone, the calendar the server buckets their finishes
// in (lib/stats.ts). The pickers use it rather than the browser's or phone's own, so "this month" near midnight
// on the 1st is the one the card is drawn for.
export function cardToday(timeZone: string | null | undefined, now = new Date()): { year: number; month: number } {
  const day = localDay(now, isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE)
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) }
}

// The earliest year a card goes back to (the server takes any from 2000).
export const CARD_FIRST_YEAR = 2000

// The years a card can be made for, newest first: this one back to the reader's first year with a finish
// (`years`, from their stats), and always last year.
export function cardYears(today: { year: number }, years: number[] = []): number[] {
  const first = Math.max(CARD_FIRST_YEAR, Math.min(today.year - 1, ...years))
  return Array.from({ length: today.year - first + 1 }, (_, i) => today.year - i)
}

// The months (1 to 12) of `year` that have started, newest first.
export function cardMonths(year: number, today: { year: number; month: number }): number[] {
  const last = year < today.year ? 12 : year === today.year ? today.month : 0
  return Array.from({ length: last }, (_, i) => last - i)
}

// ---- Words -----------------------------------------------------------------------------------

const fmt = (n: number) => n.toLocaleString("en-GB")

// month is 0 to 11 here, as in WrappedData. "My October in books", "My 2025 in books", "My 2026 so far".
export function cardTitle(year: number, month: number | null, current: boolean) {
  if (month !== null) return `My ${MONTHS[month]} in books`
  return current ? `My ${year} so far` : `My ${year} in books`
}

// Above the title: "October 2026", or "2026".
export const cardKicker = (year: number, month: number | null) => (month === null ? String(year) : `${MONTHS[month]} ${year}`)

// The headline numbers. Audiobooks are counted in time, not pages, so they get their own figure.
export function cardStats({ books, pages, minutes }: { books: number; pages: number; minutes: number }) {
  return [
    { value: fmt(books), label: books === 1 ? "book" : "books" },
    ...(pages > 0 ? [{ value: fmt(pages), label: pages === 1 ? "page" : "pages" }] : []),
    ...(minutes >= 60
      ? [{ value: fmt(Math.round(minutes / 60)), label: Math.round(minutes / 60) === 1 ? "hour listened" : "hours listened" }]
      : minutes > 0 ? [{ value: fmt(minutes), label: minutes === 1 ? "minute listened" : "minutes listened" }] : []),
  ]
}

// The moods the reader tagged on these books, most common first, as a share of all their mood tags.
// Whole percentages, at most `top` of them; moods under 5% are left off as noise.
export function moodMix(counts: Partial<Record<Mood, number>>, top = 3) {
  const entries = Object.entries(counts).filter(([, n]) => (n ?? 0) > 0) as [Mood, number][]
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  if (!total) return []
  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([mood, n]) => ({ mood, label: MOOD_LABEL[mood], percent: Math.round((n / total) * 100) }))
    .filter((m) => m.percent >= 5)
    .slice(0, top)
}

// ---- The grid --------------------------------------------------------------------------------

export interface GridBox {
  width: number
  height: number
  gap: number
  // Covers stay at least this wide: past it, the last cell says "+12 more" instead.
  minCover: number
  // And at most this wide, so one book doesn't fill a whole story.
  maxCover: number
  // Room under each cover for its stars, used only while covers are at least `labelMinCover` wide.
  // Smaller covers carry the rating on the cover instead.
  labelHeight: number
  labelMinCover: number
}

export interface GridLayout {
  columns: number
  rows: number
  coverWidth: number
  coverHeight: number
  // Whether stars go under the covers (true) or on them.
  labels: boolean
  // Covers drawn; when `more` > 0 the next cell says "+N more".
  shown: number
  more: number
}

const COVER_RATIO = 1.5

// The widest cover that fits `count` cells in the box, over every column count.
function fit(count: number, box: GridBox, label: number) {
  let best = { columns: 1, rows: count, coverWidth: 0 }
  for (let columns = 1; columns <= Math.max(1, count); columns++) {
    const rows = Math.ceil(count / columns)
    const byWidth = (box.width - box.gap * (columns - 1)) / columns
    const byHeight = ((box.height - box.gap * (rows - 1)) / rows - label) / COVER_RATIO
    const coverWidth = Math.min(byWidth, byHeight)
    if (coverWidth > best.coverWidth) best = { columns, rows, coverWidth }
  }
  return best
}

function layoutFor(count: number, box: GridBox) {
  const labelled = fit(count, box, box.labelHeight)
  return labelled.coverWidth >= box.labelMinCover ? { ...labelled, labels: true } : { ...fit(count, box, 0), labels: false }
}

// How to lay `count` covers out in the box: as large as they'll go, and when there are too many to
// keep them legible, as many as fit with a "+N more" cell last.
export function gridLayout(count: number, box: GridBox): GridLayout {
  let cells = Math.max(1, count)
  let layout = layoutFor(cells, box)
  if (layout.coverWidth < box.minCover) {
    while (cells > 1 && layoutFor(cells, box).coverWidth < box.minCover) cells--
    layout = layoutFor(cells, box)
  }
  const overflow = cells < count
  const coverWidth = Math.floor(Math.min(layout.coverWidth, box.maxCover))
  return {
    columns: Math.min(layout.columns, cells),
    rows: layout.rows,
    coverWidth,
    coverHeight: Math.floor(coverWidth * COVER_RATIO),
    labels: layout.labels,
    shown: overflow ? cells - 1 : Math.max(0, count),
    more: overflow ? count - (cells - 1) : 0,
  }
}
