import { MONTHS } from "./wrappedCopy"
import { MOODS, MOOD_LABEL, SPICE_MAX, type Mood } from "./workTags"
import { averageRating, latestRatingByBook } from "./rating"

// The stats explorer (BOO-82, Plus): any date range, two periods side by side, and filters by format,
// genre, mood, spice, author and re-reads. The rule (entitlements.ts): never take away a stat that's free.
// Everything on /stats, Wrapped and the monthly and yearly cards stays free; this only adds new ways to
// look at the same finishes. No database or "@/" imports, so the web, the app and
// scripts/test/statsExplorer.test.ts share one set of sums. lib/stats.ts explorerFinishes() feeds it.

// ---- Inputs ----------------------------------------------------------------------------------

export const EXPLORER_FORMATS = ["PRINT", "EBOOK", "AUDIOBOOK"] as const
export type ExplorerFormat = typeof EXPLORER_FORMATS[number]
export const FORMAT_LABEL: Record<ExplorerFormat, string> = { PRINT: "Print", EBOOK: "Ebook", AUDIOBOOK: "Audiobook" }

// "firsts" is each book's first finish; "rereads" every finish after it.
export const REREAD_CHOICES = ["all", "firsts", "rereads"] as const
export type RereadChoice = typeof REREAD_CHOICES[number]
export const REREAD_LABEL: Record<RereadChoice, string> = { all: "All reads", firsts: "First reads", rereads: "Re-reads only" }

export const SPICE_LEVELS = Array.from({ length: SPICE_MAX + 1 }, (_, i) => i)

// One read that ended, as the explorer sees it. `day` is the reader's calendar day ("YYYY-MM-DD", their
// zone); null for an undated finish, which counts in no range.
export interface ExplorerFinish {
  bookId: string
  title: string
  author: string
  genre: string | null
  format: ExplorerFormat
  outcome: "COMPLETED" | "DNF"
  day: string | null
  pages: number
  minutes: number
  rating: number | null
  moods: Mood[]
  spice: number | null
  // Not this book's first completed read.
  reread: boolean
}

export interface DateRange {
  from: string // "YYYY-MM-DD", inclusive
  to: string // inclusive
}

// Within a filter any value matches; across filters every one must. Empty means no filter.
export interface ExplorerFilters {
  formats: ExplorerFormat[]
  genres: string[]
  moods: Mood[]
  spice: number[]
  authors: string[]
  rereads: RereadChoice
}

export interface ExplorerQuery {
  range: DateRange
  compare: DateRange | null
  filters: ExplorerFilters
}

export const NO_FILTERS: ExplorerFilters = { formats: [], genres: [], moods: [], spice: [], authors: [], rereads: "all" }

// ---- Days ------------------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

export function isDay(raw: unknown): raw is string {
  if (typeof raw !== "string" || !DAY_RE.test(raw)) return false
  const date = new Date(`${raw}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw
}

const toDate = (day: string) => new Date(`${day}T00:00:00Z`)
const toDay = (date: Date) => date.toISOString().slice(0, 10)

export function addDays(day: string, n: number): string {
  const date = toDate(day)
  date.setUTCDate(date.getUTCDate() + n)
  return toDay(date)
}

// Both ends counted: 1 June to 1 June is one day.
export const rangeDays = ({ from, to }: DateRange) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS) + 1

const lastOfMonth = (year: number, month: number) => toDay(new Date(Date.UTC(year, month + 1, 0)))
const pad = (n: number) => String(n).padStart(2, "0")

// The earliest day a range may start: the same floor as Wrapped (lib/stats.ts parseWrappedYear).
export const EXPLORER_FIRST_DAY = "2000-01-01"
// The longest range, so a typo can't ask for ten thousand years of month buckets.
export const EXPLORER_MAX_DAYS = 366 * 30

// ---- Presets ---------------------------------------------------------------------------------

export const RANGE_PRESETS = ["thisYear", "lastYear", "last12Months", "thisMonth", "lastMonth", "last90Days", "allTime"] as const
export type RangePreset = typeof RANGE_PRESETS[number]
export const RANGE_PRESET_LABEL: Record<RangePreset, string> = {
  thisYear: "This year",
  lastYear: "Last year",
  last12Months: "Last 12 months",
  thisMonth: "This month",
  lastMonth: "Last month",
  last90Days: "Last 90 days",
  allTime: "All time",
}

// `today` is the reader's own day (their zone), as the server counts finishes.
export function presetRange(preset: RangePreset, today: string): DateRange {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7)) - 1
  switch (preset) {
    case "thisYear": return { from: `${year}-01-01`, to: today }
    case "lastYear": return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
    case "last12Months": return { from: addDays(toDay(new Date(Date.UTC(year - 1, month, Number(today.slice(8, 10))))), 1), to: today }
    case "thisMonth": return { from: `${year}-${pad(month + 1)}-01`, to: today }
    case "lastMonth": {
      const start = new Date(Date.UTC(year, month - 1, 1))
      return { from: toDay(start), to: lastOfMonth(start.getUTCFullYear(), start.getUTCMonth()) }
    }
    case "last90Days": return { from: addDays(today, -89), to: today }
    case "allTime": return { from: EXPLORER_FIRST_DAY, to: today }
  }
}

export const COMPARE_PRESETS = ["previous", "lastYear"] as const
export type ComparePreset = typeof COMPARE_PRESETS[number]
export const COMPARE_PRESET_LABEL: Record<ComparePreset, string> = { previous: "The period before", lastYear: "The same dates a year earlier" }

// What to set beside `range`: the same number of days just before it, or the same dates a year back.
// A range of whole months compares with the same number of whole months before it.
export function compareRange(preset: ComparePreset, range: DateRange): DateRange {
  if (preset === "lastYear") return { from: shiftYear(range.from, -1), to: shiftYear(range.to, -1) }
  const whole = wholeMonths(range)
  if (whole) {
    const start = new Date(Date.UTC(whole.fromYear, whole.fromMonth - whole.count, 1))
    const end = new Date(Date.UTC(whole.fromYear, whole.fromMonth, 0))
    return { from: toDay(start), to: toDay(end) }
  }
  const days = rangeDays(range)
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) }
}

// 29 February a year back is 28 February.
function shiftYear(day: string, by: number): string {
  const year = Number(day.slice(0, 4)) + by
  const month = Number(day.slice(5, 7)) - 1
  const date = Math.min(Number(day.slice(8, 10)), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  return `${year}-${pad(month + 1)}-${pad(date)}`
}

// A range from the 1st of one month to the last day of another, as months.
function wholeMonths({ from, to }: DateRange) {
  if (from.slice(8) !== "01") return null
  const toYear = Number(to.slice(0, 4))
  const toMonth = Number(to.slice(5, 7)) - 1
  if (to !== lastOfMonth(toYear, toMonth)) return null
  const fromYear = Number(from.slice(0, 4))
  const fromMonth = Number(from.slice(5, 7)) - 1
  return { fromYear, fromMonth, toYear, toMonth, count: (toYear - fromYear) * 12 + toMonth - fromMonth + 1 }
}

// ---- Query strings ---------------------------------------------------------------------------

// The explorer's address, which a saved view keeps: from, to, cfrom, cto, and each filter as a
// comma list (format=AUDIOBOOK,EBOOK&genre=Fantasy&mood=dark&spice=3,4&author=…&reads=rereads).
export function explorerSearch(query: ExplorerQuery): string {
  const q = new URLSearchParams({ from: query.range.from, to: query.range.to })
  if (query.compare) {
    q.set("cfrom", query.compare.from)
    q.set("cto", query.compare.to)
  }
  const { formats, genres, moods, spice, authors, rereads } = query.filters
  if (formats.length) q.set("format", formats.join(","))
  if (genres.length) q.set("genre", genres.join("|"))
  if (moods.length) q.set("mood", moods.join(","))
  if (spice.length) q.set("spice", spice.join(","))
  if (authors.length) q.set("author", authors.join("|"))
  if (rereads !== "all") q.set("reads", rereads)
  return q.toString()
}

type Params = URLSearchParams | Record<string, string | string[] | undefined>
const read = (params: Params, key: string): string | null => {
  if (params instanceof URLSearchParams) return params.get(key)
  const value = params[key]
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}
const list = (raw: string | null, sep: string) => (raw ? Array.from(new Set(raw.split(sep).map((s) => s.trim()).filter(Boolean))).slice(0, 50) : [])

export type ParsedQuery = { ok: true; query: ExplorerQuery } | { ok: false; error: string }

function checkRange(from: string | null, to: string | null, today: string): DateRange | string {
  if (!isDay(from) || !isDay(to)) return "Pick a start and an end date."
  if (from > to) return "The start date has to come before the end date."
  if (from < EXPLORER_FIRST_DAY) return "Ranges go back as far as 1 January 2000."
  // A day ahead of the reader's own today, at most: UTC+14 is already tomorrow.
  if (from > addDays(today, 1)) return "Pick a range that has already started."
  if (rangeDays({ from, to }) > EXPLORER_MAX_DAYS) return "Pick a range of 30 years or less."
  return { from, to }
}

// Reads the explorer's address. With no dates it opens on this year; unknown filter values are dropped.
export function parseExplorerQuery(params: Params, today: string): ParsedQuery {
  const fromRaw = read(params, "from")
  const toRaw = read(params, "to")
  const range = fromRaw === null && toRaw === null ? presetRange("thisYear", today) : checkRange(fromRaw, toRaw, today)
  if (typeof range === "string") return { ok: false, error: range }

  let compare: DateRange | null = null
  const cfrom = read(params, "cfrom")
  const cto = read(params, "cto")
  if (cfrom !== null || cto !== null) {
    const checked = checkRange(cfrom, cto, today)
    if (typeof checked === "string") return { ok: false, error: `Comparison: ${checked.charAt(0).toLowerCase()}${checked.slice(1)}` }
    compare = checked
  }

  const reads = read(params, "reads")
  return {
    ok: true,
    query: {
      range,
      compare,
      filters: {
        formats: list(read(params, "format"), ",").filter((f): f is ExplorerFormat => (EXPLORER_FORMATS as readonly string[]).includes(f)),
        genres: list(read(params, "genre"), "|"),
        moods: list(read(params, "mood")?.toUpperCase() ?? null, ",").filter((m): m is Mood => (MOODS as readonly string[]).includes(m)),
        spice: list(read(params, "spice"), ",").map(Number).filter((n) => SPICE_LEVELS.includes(n)).sort((a, b) => a - b),
        authors: list(read(params, "author"), "|"),
        rereads: (REREAD_CHOICES as readonly string[]).includes(reads ?? "") ? (reads as RereadChoice) : "all",
      },
    },
  }
}

export const hasFilters = (f: ExplorerFilters) =>
  f.formats.length + f.genres.length + f.moods.length + f.spice.length + f.authors.length > 0 || f.rereads !== "all"

// ---- The sums --------------------------------------------------------------------------------

export interface ExplorerTally {
  name: string
  count: number
}

export interface ExplorerPeriod {
  range: DateRange
  label: string
  // Completed reads in the range, re-reads included, and the distinct books they cover.
  finishes: number
  books: number
  pages: number
  minutes: number
  rereads: number
  dnf: number
  dnfRate: number | null
  averageRating: number | null
  ratedReads: number
  averagePages: number | null
  // One bucket per calendar month the range touches (or per day, for a range of 31 days or less).
  timeline: { key: string; label: string; books: number; pages: number; minutes: number }[]
  formats: ExplorerTally[]
  genres: ExplorerTally[]
  authors: ExplorerTally[]
  moods: ExplorerTally[]
  // Spice 0 to 5, then "Not rated", every level shown.
  spice: ExplorerTally[]
  // Whole stars 1 to 5, a 4¾ counted with the fours.
  ratings: ExplorerTally[]
}

const norm = (s: string) => s.trim().toLocaleLowerCase()

export function matchesFilters(f: ExplorerFinish, filters: ExplorerFilters): boolean {
  if (filters.formats.length && !filters.formats.includes(f.format)) return false
  if (filters.genres.length && !(f.genre && filters.genres.some((g) => norm(g) === norm(f.genre!)))) return false
  if (filters.authors.length && !filters.authors.some((a) => norm(a) === norm(f.author))) return false
  if (filters.moods.length && !filters.moods.some((m) => f.moods.includes(m))) return false
  if (filters.spice.length && (f.spice === null || !filters.spice.includes(f.spice))) return false
  // A DNF is never a re-read of a finished book, so it's left out of "re-reads only" and kept with "first reads".
  if (filters.rereads === "rereads" && !(f.outcome === "COMPLETED" && f.reread)) return false
  if (filters.rereads === "firsts" && f.outcome === "COMPLETED" && f.reread) return false
  return true
}

const inRange = (f: ExplorerFinish, { from, to }: DateRange) => f.day !== null && f.day >= from && f.day <= to

function tallyOf(values: (string | null | undefined)[], limit: number): ExplorerTally[] {
  const counts = new Map<string, ExplorerTally>()
  for (const raw of values) {
    const name = raw?.trim()
    if (!name) continue
    const key = norm(name)
    const entry = counts.get(key)
    if (entry) entry.count++
    else counts.set(key, { name, count: 1 })
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit)
}

const fmtDay = (day: string, withYear: boolean) => {
  const d = toDate(day)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`
}

// "1 June – 31 August 2026", "October 2026", "2025", "12 December 2025 – 3 January 2026".
export function rangeLabel(range: DateRange): string {
  const whole = wholeMonths(range)
  if (whole && whole.fromMonth === 0 && whole.toMonth === 11 && whole.fromYear === whole.toYear) return String(whole.fromYear)
  if (whole && whole.count === 1) return `${MONTHS[whole.fromMonth]} ${whole.fromYear}`
  if (whole && whole.fromYear === whole.toYear) return `${MONTHS[whole.fromMonth]} – ${MONTHS[whole.toMonth]} ${whole.toYear}`
  if (whole) return `${MONTHS[whole.fromMonth]} ${whole.fromYear} – ${MONTHS[whole.toMonth]} ${whole.toYear}`
  if (range.from === range.to) return fmtDay(range.from, true)
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4)
  return `${fmtDay(range.from, !sameYear)} – ${fmtDay(range.to, true)}`
}

function timelineOf(range: DateRange, finishes: ExplorerFinish[]): ExplorerPeriod["timeline"] {
  const byDay = rangeDays(range) <= 31
  const buckets = new Map<string, ExplorerPeriod["timeline"][number]>()
  if (byDay) {
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
      buckets.set(day, { key: day, label: String(Number(day.slice(8, 10))), books: 0, pages: 0, minutes: 0 })
    }
  } else {
    const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4)
    let y = Number(range.from.slice(0, 4))
    let m = Number(range.from.slice(5, 7)) - 1
    const endKey = range.to.slice(0, 7)
    for (;;) {
      const key = `${y}-${pad(m + 1)}`
      buckets.set(key, { key, label: sameYear ? MONTHS[m].slice(0, 3) : `${MONTHS[m].slice(0, 3)} ${String(y).slice(2)}`, books: 0, pages: 0, minutes: 0 })
      if (key >= endKey) break
      m++
      if (m === 12) { m = 0; y++ }
    }
  }
  for (const f of finishes) {
    const bucket = buckets.get(byDay ? f.day! : f.day!.slice(0, 7))
    if (!bucket) continue
    bucket.books++
    bucket.pages += f.pages
    bucket.minutes += f.minutes
  }
  return Array.from(buckets.values())
}

// The numbers for one range under the filters. A tally counts reads, so a book re-read in the range
// counts twice in its genre, as it does in the timeline; `books` is the distinct count.
export function explorePeriod(all: ExplorerFinish[], range: DateRange, filters: ExplorerFilters): ExplorerPeriod {
  const ended = all.filter((f) => inRange(f, range) && matchesFilters(f, filters))
  const done = ended.filter((f) => f.outcome === "COMPLETED")
  const dnf = ended.length - done.length
  // Ratings follow the one rule (rating.ts latestRatingByBook): each book once, its latest rating in the range.
  const rated = Array.from(latestRatingByBook([...done].sort((a, b) => (a.day ?? "").localeCompare(b.day ?? ""))).values())
  const byBook = new Map<string, ExplorerFinish>()
  for (const f of done) byBook.set(f.bookId, f)
  const sized = Array.from(byBook.values()).filter((f) => f.pages > 0)

  const spiceCounts = SPICE_LEVELS.map((level) => ({ name: String(level), count: done.filter((f) => f.spice === level).length }))
  const ratings = [1, 2, 3, 4, 5].map((star) => ({ name: String(star), count: rated.filter((r) => Math.min(5, Math.max(1, Math.floor(r))) === star).length }))

  return {
    range,
    label: rangeLabel(range),
    finishes: done.length,
    books: byBook.size,
    pages: done.reduce((s, f) => s + f.pages, 0),
    minutes: done.reduce((s, f) => s + f.minutes, 0),
    rereads: done.filter((f) => f.reread).length,
    dnf,
    dnfRate: ended.length ? dnf / ended.length : null,
    ratedReads: rated.length,
    averageRating: averageRating(rated),
    averagePages: sized.length ? Math.round(sized.reduce((s, f) => s + f.pages, 0) / sized.length) : null,
    timeline: timelineOf(range, done),
    formats: EXPLORER_FORMATS.map((format) => ({ name: FORMAT_LABEL[format], count: done.filter((f) => f.format === format).length })),
    genres: tallyOf(done.map((f) => f.genre), 12),
    authors: tallyOf(done.map((f) => f.author), 12),
    moods: tallyOf(done.flatMap((f) => f.moods.map((m) => MOOD_LABEL[m])), MOODS.length),
    spice: [...spiceCounts, { name: "Not rated", count: done.filter((f) => f.spice === null).length }],
    ratings,
  }
}

// What the filters can offer: every genre and author on the reader's finished reads, most read first.
export interface ExplorerOptions {
  genres: string[]
  authors: string[]
  // Finishes with no date, which no range can include.
  undated: number
}

export function explorerOptions(all: ExplorerFinish[]): ExplorerOptions {
  const done = all.filter((f) => f.outcome === "COMPLETED")
  return {
    genres: tallyOf(done.map((f) => f.genre), 200).map((t) => t.name),
    authors: tallyOf(done.map((f) => f.author), 500).map((t) => t.name),
    undated: done.filter((f) => f.day === null).length,
  }
}

export interface ExplorerResult {
  query: ExplorerQuery
  period: ExplorerPeriod
  compare: ExplorerPeriod | null
  options: ExplorerOptions
}

export function explore(all: ExplorerFinish[], query: ExplorerQuery): ExplorerResult {
  return {
    query,
    period: explorePeriod(all, query.range, query.filters),
    compare: query.compare ? explorePeriod(all, query.compare, query.filters) : null,
    options: explorerOptions(all),
  }
}

// ---- Charts and CSV --------------------------------------------------------------------------

export const EXPLORER_CHARTS = ["timeline", "formats", "genres", "authors", "moods", "spice", "ratings"] as const
export type ExplorerChart = typeof EXPLORER_CHARTS[number]
export const EXPLORER_CHART_LABEL: Record<ExplorerChart, string> = {
  timeline: "Over time",
  formats: "Formats",
  genres: "Genres",
  authors: "Authors",
  moods: "Moods",
  spice: "Spice",
  ratings: "Ratings",
}

// A spreadsheet cell: quoted when it holds a comma, quote or line break, and a leading = + - @ is
// defused so a title can't run as a formula when the file is opened.
export function csvCell(value: string | number | null): string {
  if (value === null) return ""
  let text = String(value)
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const csvOf = (rows: (string | number | null)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"

// One chart as rows: its label column, then a count per period. The timeline has reads (a re-read counts
// again, so not "books"), pages and minutes; with a comparison, its rows line up by position (the first month beside the first month).
export function chartRows(result: Pick<ExplorerResult, "period" | "compare">, chart: ExplorerChart): (string | number | null)[][] {
  const { period, compare } = result
  if (chart === "timeline") {
    const header = ["Period", "Reads", "Pages", "Minutes listened"]
    if (!compare) return [header, ...period.timeline.map((t) => [t.key, t.books, t.pages, t.minutes])]
    const length = Math.max(period.timeline.length, compare.timeline.length)
    const rows: (string | number | null)[][] = [[...header, "Compared period", "Reads", "Pages", "Minutes listened"]]
    for (let i = 0; i < length; i++) {
      const a = period.timeline[i]
      const b = compare.timeline[i]
      rows.push([a?.key ?? null, a?.books ?? null, a?.pages ?? null, a?.minutes ?? null, b?.key ?? null, b?.books ?? null, b?.pages ?? null, b?.minutes ?? null])
    }
    return rows
  }
  const first = { formats: "Format", genres: "Genre", authors: "Author", moods: "Mood", spice: "Spice", ratings: "Stars" }[chart]
  const names: string[] = []
  for (const t of [...period[chart], ...(compare?.[chart] ?? [])]) if (!names.includes(t.name)) names.push(t.name)
  const count = (p: ExplorerPeriod, name: string) => p[chart].find((t) => t.name === name)?.count ?? 0
  return [
    [first, period.label, ...(compare ? [compare.label] : [])],
    ...names.map((name) => [name, count(period, name), ...(compare ? [count(compare, name)] : [])]),
  ]
}

// "bookmark-genres-2026-06-01-to-2026-08-31.csv"
export const chartFileName = (chart: ExplorerChart, range: DateRange) => `bookmark-${chart}-${range.from}-to-${range.to}.csv`

// ---- Saved views -----------------------------------------------------------------------------

export const SAVED_VIEWS_MAX = 20
export const SAVED_VIEW_NAME_MAX = 60

export interface SavedStatView {
  id: string
  name: string
  // explorerSearch() of the view, without a leading "?".
  query: string
  createdAt: string
}

// ---- Range cards -----------------------------------------------------------------------------

// A Wrap card's words for a custom range. "My June to August in books", "My 45 days in books".
export function rangeCardTitle(range: DateRange): string {
  const whole = wholeMonths(range)
  if (whole && whole.count === 1) return `My ${MONTHS[whole.fromMonth]} in books`
  if (whole && whole.fromYear === whole.toYear && whole.fromMonth === 0 && whole.toMonth === 11) return `My ${whole.fromYear} in books`
  if (whole && whole.fromYear === whole.toYear) return `My ${MONTHS[whole.fromMonth]} to ${MONTHS[whole.toMonth]} in books`
  if (whole) return `My ${MONTHS[whole.fromMonth].slice(0, 3)} ${whole.fromYear} to ${MONTHS[whole.toMonth].slice(0, 3)} ${whole.toYear} in books`
  const days = rangeDays(range)
  return days === 1 ? "My day in books" : `My ${days.toLocaleString("en-GB")} days in books`
}
