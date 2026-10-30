// Moods, content warnings and spice on a Work: the fixed sets, what a reader may submit, and how a book page
// sums everyone's tags up. No database or "@/" imports, so scripts/test/workTags.test.ts runs under
// plain Node and scripts/seed-moods-from-storygraph.ts can reuse the StoryGraph mapping.
import { z } from "zod";

// StoryGraph's twelve, in the order its export lists them. The enum in prisma/schema.prisma matches.
export const MOODS = [
  "ADVENTUROUS", "CHALLENGING", "DARK", "EMOTIONAL", "FUNNY", "HOPEFUL",
  "INFORMATIVE", "INSPIRING", "LIGHTHEARTED", "MYSTERIOUS", "REFLECTIVE", "TENSE",
] as const
export type Mood = typeof MOODS[number]

export const MOOD_LABEL: Record<Mood, string> = {
  ADVENTUROUS: "adventurous",
  CHALLENGING: "challenging",
  DARK: "dark",
  EMOTIONAL: "emotional",
  FUNNY: "funny",
  HOPEFUL: "hopeful",
  INFORMATIVE: "informative",
  INSPIRING: "inspiring",
  LIGHTHEARTED: "lighthearted",
  MYSTERIOUS: "mysterious",
  REFLECTIVE: "reflective",
  TENSE: "tense",
}

// A reader picks up to this many: a book is a few things, not everything.
export const MOODS_MAX = 5

export const WARNING_LEVELS = ["MINOR", "MODERATE", "GRAPHIC"] as const
export type WarningLevel = typeof WARNING_LEVELS[number]
export const WARNING_LEVEL_LABEL: Record<WarningLevel, string> = { MINOR: "minor", MODERATE: "moderate", GRAPHIC: "graphic" }

// A fixed list, so warnings add up across readers instead of fragmenting into spellings. Modelled on
// the topics romance and romantasy readers check first; "Other" is deliberately not here, because an
// unaggregatable warning helps nobody.
export const WARNING_TOPICS = [
  "Abuse", "Addiction", "Animal death", "Blood", "Body horror", "Bullying", "Cancer", "Child abuse",
  "Child death", "Death", "Death of a parent", "Domestic violence", "Drug use", "Eating disorder",
  "Emotional abuse", "Gore", "Grief", "Homophobia", "Incest", "Infertility", "Infidelity", "Kidnapping",
  "Medical content", "Mental illness", "Miscarriage", "Misogyny", "Murder", "Pregnancy", "Racism",
  "Self-harm", "Sexual assault", "Sexual content", "Sexual harassment", "Slavery", "Stalking", "Suicide",
  "Torture", "Toxic relationship", "Transphobia", "Violence", "War",
] as const
export type WarningTopic = typeof WARNING_TOPICS[number]
export const WARNINGS_MAX = 20

// Spice: how explicit the sex is, 0 to 5, from readers who finished the book. Romance and romantasy
// readers check this before anything else. A book shows the median once SPICE_MIN_REPORTS readers have
// given one, so no single reader sets the number, and a median rather than a mean so one outlier
// can't drag it.
export const SPICE_LEVELS = [0, 1, 2, 3, 4, 5] as const
export type SpiceLevel = typeof SPICE_LEVELS[number]
export const SPICE_MAX = 5
export const SPICE_MIN_REPORTS = 5
// Below that, a book shows the middle answer as "Early" from this many readers: two agreeing is a hint
// worth having when most romantasy launches with nothing, but one reader alone still sets no number.
export const SPICE_EARLY_MIN_REPORTS = 2
export const SPICE_LABEL: Record<SpiceLevel, string> = {
  0: "none", 1: "mild", 2: "warm", 3: "steamy", 4: "spicy", 5: "scorching",
}
export const SPICE_HINT: Record<SpiceLevel, string> = {
  0: "Nothing beyond a kiss",
  1: "Kissing and some tension",
  2: "Sex happens off the page",
  3: "Open door, a few scenes",
  4: "Explicit and frequent",
  5: "Very explicit, close to erotica",
}

// Spice is only asked about and shown where it means something: a book whose Open Library subjects or
// any reader's genre for it say romance (romantasy and erotica included), or one readers have flagged
// for sexual content. Readers catch what Open Library misses: romantasy filed under fantasy alone, or
// a duplicate work with no subjects at all.
const ROMANCE_PATTERN = /romance|romantic|romantasy|love[\s_-]*stor|erotic/i
export type SpiceContext = { subjects?: string[] | null, genres?: (string | null)[] }
export function spiceApplies(about: SpiceContext | undefined, warnings: { topic: string }[]): boolean {
  if (warnings.some((w) => w.topic === "Sexual content")) return true
  return [...(about?.genres ?? []), ...(about?.subjects ?? [])].some((t) => !!t && ROMANCE_PATTERN.test(t))
}

export const spiceSchema = z.number().int().min(0).max(SPICE_MAX).nullable()

export const readerTagsSchema = z.object({
  moods: z.array(z.enum(MOODS)).max(MOODS_MAX, `Pick up to ${MOODS_MAX} moods`).transform((m) => Array.from(new Set(m))),
  warnings: z.array(z.object({ topic: z.enum(WARNING_TOPICS), level: z.enum(WARNING_LEVELS) })).max(WARNINGS_MAX)
    // One level per topic: the last one typed wins.
    .transform((ws) => Array.from(new Map(ws.map((w) => [w.topic, w])).values())),
  // Left out by a client that doesn't edit spice, which keeps the stored value; null clears it.
  spice: spiceSchema.optional(),
})
export type ReaderTagsInput = z.infer<typeof readerTagsSchema>
export type ContentWarning = ReaderTagsInput["warnings"][number]

// Rows as stored: warnings is JSON, so it's validated on the way out as well as in.
export type ReaderTagsRow = { userId: string, moods: string[], warnings: unknown, spice?: number | null }

const asSpice = (raw: unknown): SpiceLevel | null =>
  typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= SPICE_MAX ? (raw as SpiceLevel) : null

// The middle report, a tie between two middles rounding up: a reader avoiding spice is better warned.
export function spiceMedian(reports: number[]): SpiceLevel | null {
  if (reports.length === 0) return null
  const sorted = [...reports].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return asSpice(sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2))
}

export function parseWarnings(raw: unknown): ContentWarning[] {
  const parsed = readerTagsSchema.shape.warnings.safeParse(raw ?? [])
  return parsed.success ? parsed.data : []
}

export type MoodCount = { mood: Mood, count: number, share: number }
export type WarningSummary = {
  topic: WarningTopic
  // The level most readers gave it; ties go to the more serious one.
  level: WarningLevel
  count: number
  byLevel: Record<WarningLevel, number>
}
export type SpiceSummary = {
  // The median, or null until SPICE_MIN_REPORTS readers have reported one.
  level: SpiceLevel | null
  // Between SPICE_EARLY_MIN_REPORTS and SPICE_MIN_REPORTS reports: the median so far, shown as early.
  early: SpiceLevel | null
  reports: number
}
export type SavedTags = { moods: Mood[], warnings: ContentWarning[], spice: SpiceLevel | null }
export type TagAggregate = {
  readers: number
  moods: MoodCount[]
  warnings: WarningSummary[]
  spice: SpiceSummary
  // Whether the book is one spice applies to (spiceApplies): the spice line and picker show only if so.
  spiceApplies: boolean
  mine: SavedTags | null
}

const LEVEL_RANK: Record<WarningLevel, number> = { MINOR: 0, MODERATE: 1, GRAPHIC: 2 }

// Everyone's tags for one work, summed: moods by how many readers chose them (share of taggers, as a
// fraction), warnings by topic with the commonest level. `viewerId` picks out the viewer's own row, and
// `about` is the book's subjects and genre, for spiceApplies.
export function aggregateTags(rows: ReaderTagsRow[], viewerId?: string | null, about?: SpiceContext): TagAggregate {
  const moodCounts = new Map<Mood, number>()
  const warningCounts = new Map<WarningTopic, Record<WarningLevel, number>>()
  const spiceReports: number[] = []
  let mine: SavedTags | null = null
  let readers = 0

  for (const row of rows) {
    const moods = Array.from(new Set(row.moods.filter((m): m is Mood => (MOODS as readonly string[]).includes(m))))
    const warnings = parseWarnings(row.warnings)
    const spice = asSpice(row.spice)
    if (moods.length === 0 && warnings.length === 0 && spice === null) continue
    readers++
    if (spice !== null) spiceReports.push(spice)
    for (const m of moods) moodCounts.set(m, (moodCounts.get(m) ?? 0) + 1)
    for (const w of warnings) {
      const byLevel = warningCounts.get(w.topic) ?? { MINOR: 0, MODERATE: 0, GRAPHIC: 0 }
      byLevel[w.level]++
      warningCounts.set(w.topic, byLevel)
    }
    if (viewerId && row.userId === viewerId) mine = { moods, warnings, spice }
  }

  const moods: MoodCount[] = Array.from(moodCounts, ([mood, count]) => ({ mood, count, share: readers ? count / readers : 0 }))
    .sort((a, b) => b.count - a.count || MOODS.indexOf(a.mood) - MOODS.indexOf(b.mood))

  const warnings: WarningSummary[] = Array.from(warningCounts, ([topic, byLevel]) => {
    const count = byLevel.MINOR + byLevel.MODERATE + byLevel.GRAPHIC
    const level = (Object.keys(byLevel) as WarningLevel[])
      .sort((a, b) => byLevel[b] - byLevel[a] || LEVEL_RANK[b] - LEVEL_RANK[a])[0]
    return { topic, level, count, byLevel }
  }).sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.count - a.count || a.topic.localeCompare(b.topic))

  const spice: SpiceSummary = {
    level: spiceReports.length >= SPICE_MIN_REPORTS ? spiceMedian(spiceReports) : null,
    early: spiceReports.length >= SPICE_EARLY_MIN_REPORTS && spiceReports.length < SPICE_MIN_REPORTS ? spiceMedian(spiceReports) : null,
    reports: spiceReports.length,
  }

  return { readers, moods, warnings, spice, spiceApplies: spiceApplies(about, warnings), mine }
}

// Whether to ask this reader for spice: the book is one it applies to, the warnings they're giving now
// flag sexual content, or they reported spice before (so they can still change or clear it).
export const spiceAskable = (tags: TagAggregate | undefined, warnings: { topic: string }[]) =>
  !!tags?.spiceApplies || tags?.mine?.spice != null || spiceApplies(undefined, warnings)

// Once a book has this many taggers, a mood needs MOOD_FLOOR of them to be shown: with only twelve moods,
// a stray pick or two would otherwise sit among the real ones on a book a thousand people tagged. Below
// that, every mood counts, since each reader is a big share of a small number.
export const MOOD_FLOOR_READERS = 10
export const MOOD_FLOOR = 0.1

// The moods worth showing for a book, strongest first, at most `max`. The full list stays in the
// aggregate for search scoring, where a small share only nudges.
export function shownMoods(moods: MoodCount[], readers: number, max: number): MoodCount[] {
  const floor = readers >= MOOD_FLOOR_READERS ? MOOD_FLOOR : 0
  return moods.filter((m) => m.share >= floor).slice(0, max)
}

// StoryGraph's "Moods" column: "adventurous, dark, tense". Words it doesn't use are ignored.
export function moodsFromStoryGraph(raw: string | null | undefined): Mood[] {
  const out: Mood[] = []
  for (const part of (raw ?? "").split(/[,;|]/)) {
    const word = part.trim().toUpperCase().replace(/[^A-Z]/g, "")
    if ((MOODS as readonly string[]).includes(word) && !out.includes(word as Mood)) out.push(word as Mood)
  }
  return out.slice(0, MOODS_MAX)
}

// A spice range as a search shows it: "spice 2–3", "spice 3+", "spice up to 1".
export function spiceRangeText(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return min === max ? `spice ${min}` : `spice ${min}–${max}`
  if (min !== null) return `spice ${min}+`
  if (max !== null) return max === 0 ? "no spice" : `spice up to ${max}`
  return null
}
