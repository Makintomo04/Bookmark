import { GENRES, genreBySlug } from "./genres.ts"

// Seasonal quests: the parts the browser needs too (goal shapes, wording, the staff form's checks).
// Server-side counting lives in lib/quests.ts.

// ---- Goals -------------------------------------------------------------------------------
// A tagged union, stored as Quest.goal JSON. To add a goal type: add a member here, a case in
// parseGoal() and describeGoal(), and a filter in goalMatches() (lib/quests.ts).
export type QuestGoal =
  // Finish `count` books from a list (usually a Bookmark Pick).
  | { type: "list"; count: number; listId: string }
  // Finish `count` books in a genre (a slug from lib/genres.ts).
  | { type: "genre"; count: number; genre: string }
  // Finish `count` books of at least `minPages` pages.
  | { type: "pages"; count: number; minPages: number }
  // Finish `count` books that were also started inside the window.
  | { type: "startedInWindow"; count: number }

export type QuestGoalType = QuestGoal["type"]

export const GOAL_TYPES: { type: QuestGoalType; label: string }[] = [
  { type: "list", label: "Books from a list" },
  { type: "genre", label: "Books in a genre" },
  { type: "pages", label: "Long books" },
  { type: "startedInWindow", label: "Books started and finished in the quest" },
]

export const QUEST_COUNT_MAX = 100
// Page counts are typed by readers. Anything longer than this is treated as a typo or a game.
export const PAGES_SANITY_MAX = 3000

const int = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN)

export function parseGoal(raw: any): QuestGoal | null {
  const count = int(raw?.count)
  if (!Number.isInteger(count) || count < 1 || count > QUEST_COUNT_MAX) return null
  switch (raw?.type) {
    case "list":
      return typeof raw.listId === "string" && /^[a-f0-9]{24}$/.test(raw.listId) ? { type: "list", count, listId: raw.listId } : null
    case "genre":
      return genreBySlug(raw.genre) ? { type: "genre", count, genre: raw.genre } : null
    case "pages": {
      const minPages = int(raw.minPages)
      return Number.isInteger(minPages) && minPages >= 1 && minPages <= PAGES_SANITY_MAX ? { type: "pages", count, minPages } : null
    }
    case "startedInWindow":
      return { type: "startedInWindow", count }
    default:
      return null
  }
}

const books = (n: number) => (n === 1 ? "1 book" : `${n} books`)

// "Finish 3 books of 600+ pages". `listTitle` names the list when the caller has it.
export function describeGoal(goal: QuestGoal, listTitle?: string | null): string {
  switch (goal.type) {
    case "list": return `Finish ${books(goal.count)} from ${listTitle ? `“${listTitle}”` : "the quest list"}`
    case "genre": return `Finish ${books(goal.count)} in ${genreBySlug(goal.genre)?.label ?? goal.genre}`
    case "pages": return `Finish ${books(goal.count)} of ${goal.minPages.toLocaleString("en-GB")}+ pages`
    case "startedInWindow": return `Start and finish ${books(goal.count)} during the quest`
  }
}

// ---- Genres --------------------------------------------------------------------------------
// Book.genre is free text ("Sci-fi", "science fiction", "Fantasy"), so match loosely on the label,
// the slug and a few common spellings.
const squash = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "")

const GENRE_ALIASES: Record<string, string[]> = {
  "sci-fi": ["science fiction", "scifi", "sf", "speculative fiction"],
  "mystery-thriller": ["mystery", "thriller", "crime", "detective", "suspense", "mystery thriller"],
  "young-adult": ["ya", "young adult fiction", "teen"],
  "biography-memoir": ["biography", "memoir", "autobiography"],
  "graphic-novels": ["graphic novel", "comics", "comic", "manga"],
  "literary-fiction": ["literary", "literature"],
  "classics": ["classic", "classic literature"],
  "historical-fiction": ["historical"],
  "self-help": ["self help", "personal development"],
}

const GENRE_NAMES = new Map(
  GENRES.map((g) => [g.slug, new Set([g.slug, g.label, ...(GENRE_ALIASES[g.slug] ?? [])].map(squash))])
)

export function bookInGenre(bookGenre: string | null | undefined, slug: string): boolean {
  if (!bookGenre) return false
  return GENRE_NAMES.get(slug)?.has(squash(bookGenre)) ?? false
}

// ---- Pages ---------------------------------------------------------------------------------
// The page count a pages goal trusts. Open Library's count wins when the book has a work key (a
// reader can't inflate it); otherwise the reader's own, and either way nothing over PAGES_SANITY_MAX.
export function trustedPages(typed: number, openLibrary: number | null | undefined): number | null {
  const pages = openLibrary && openLibrary > 0 ? openLibrary : typed
  return pages > 0 && pages <= PAGES_SANITY_MAX ? pages : null
}

// ---- Medals --------------------------------------------------------------------------------
// Quest medals sit beside the static ladders in UserAchievement, keyed "QUEST:<questId>".
export const QUEST_KEY_PREFIX = "QUEST:"
export const questKey = (questId: string) => `${QUEST_KEY_PREFIX}${questId}`
export const isQuestKey = (key: string) => key.startsWith(QUEST_KEY_PREFIX)
export const questIdOf = (key: string) => (isQuestKey(key) ? key.slice(QUEST_KEY_PREFIX.length) : null)

// Names, not components, so they can live in the database. app/components/achievements/QuestMedal.tsx draws them.
export const QUEST_ICONS = ["leaf", "snowflake", "flower", "sun", "mountain", "book", "sparkles", "moon"] as const
export type QuestIcon = (typeof QUEST_ICONS)[number]

export interface QuestMedalDesign {
  colour: string
  ribbon: string
  icon: string
}

// ---- Window --------------------------------------------------------------------------------
export type QuestPhase = "upcoming" | "live" | "ended"

export function questPhase(q: { startsAt: Date | string; endsAt: Date | string }, now = new Date()): QuestPhase {
  if (now < new Date(q.startsAt)) return "upcoming"
  if (now > new Date(q.endsAt)) return "ended"
  return "live"
}

// ---- Staff form ----------------------------------------------------------------------------
export const QUEST_TITLE_MAX = 80
export const QUEST_DESCRIPTION_MAX = 600
const HEX = /^#[0-9a-fA-F]{6}$/

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

// yyyy-mm-dd as UTC: the start of the first day, or the last moment of the last day.
const toDay = (v: unknown, endOfDay: boolean) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
  return isNaN(d.getTime()) ? null : d
}

export interface QuestInput {
  slug: string
  title: string
  description: string
  startsAt: Date
  endsAt: Date
  goal: QuestGoal
  medalColour: string
  ribbonColour: string
  medalIcon: string
  hidden: boolean
}

// The staff form's body, as JSON with yyyy-mm-dd dates, into quest data or an error message.
export function parseQuestInput(body: any): { data: QuestInput } | { error: string } {
  const title = clean(body?.title, QUEST_TITLE_MAX)
  if (!title) return { error: "Give the quest a title." }
  const slug = slugify(clean(body?.slug, 60) || title)
  if (!slug) return { error: "The address needs at least one letter or number." }
  const description = clean(body?.description, QUEST_DESCRIPTION_MAX)
  if (!description) return { error: "Say what the quest is about." }
  const startsAt = toDay(body?.startsAt, false)
  const endsAt = toDay(body?.endsAt, true)
  if (!startsAt || !endsAt) return { error: "Pick a start and an end date." }
  if (endsAt <= startsAt) return { error: "The quest has to end after it starts." }
  const goal = parseGoal(body?.goal)
  if (!goal) return { error: `Set a goal: a type, and a number of books from 1 to ${QUEST_COUNT_MAX}.` }
  const medalColour = HEX.test(body?.medalColour) ? body.medalColour : null
  const ribbonColour = HEX.test(body?.ribbonColour) ? body.ribbonColour : null
  if (!medalColour || !ribbonColour) return { error: "Pick the medal and ribbon colours." }
  const medalIcon = (QUEST_ICONS as readonly string[]).includes(body?.medalIcon) ? body.medalIcon : "book"
  return { data: { slug, title, description, startsAt, endsAt, goal, medalColour, ribbonColour, medalIcon, hidden: !!body?.hidden } }
}

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10)

// What the staff form edits: plain JSON, dates as yyyy-mm-dd.
export interface EditableQuest {
  id?: string
  slug: string
  title: string
  description: string
  startsAt: string
  endsAt: string
  goal: { type: QuestGoalType; count: number; listId?: string; genre?: string; minPages?: number }
  medalColour: string
  ribbonColour: string
  medalIcon: string
  hidden: boolean
}

export const emptyQuest = (): EditableQuest => ({
  slug: "",
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  goal: { type: "startedInWindow", count: 3 },
  medalColour: "#B4532A",
  ribbonColour: "#2F4858",
  medalIcon: "leaf",
  hidden: true,
})

export const toEditableQuest = (q: {
  id: string; slug: string; title: string; description: string; startsAt: Date | string; endsAt: Date | string
  goal: unknown; medalColour: string; ribbonColour: string; medalIcon: string; hidden: boolean
}): EditableQuest => ({
  id: q.id,
  slug: q.slug,
  title: q.title,
  description: q.description,
  startsAt: day(q.startsAt),
  endsAt: day(q.endsAt),
  goal: q.goal as EditableQuest["goal"],
  medalColour: q.medalColour,
  ribbonColour: q.ribbonColour,
  medalIcon: q.medalIcon,
  hidden: q.hidden,
})

// Windows are whole UTC days, so they're shown in UTC: "1 Oct – 30 Nov 2026".
const fmtDay = (d: Date | string, withYear: boolean) =>
  new Date(d).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", ...(withYear && { year: "numeric" }) })

export function questDates(startsAt: Date | string, endsAt: Date | string) {
  const sameYear = new Date(startsAt).getUTCFullYear() === new Date(endsAt).getUTCFullYear()
  return `${fmtDay(startsAt, !sameYear)} – ${fmtDay(endsAt, true)}`
}

export const questDay = (d: Date | string) => fmtDay(d, true)

// "3 days left", "Last day", "Starts in 5 days".
export function questCountdown(q: { startsAt: Date | string; endsAt: Date | string }, now = new Date()) {
  const DAY = 86400000
  const phase = questPhase(q, now)
  if (phase === "upcoming") {
    const days = Math.ceil((+new Date(q.startsAt) - +now) / DAY)
    return days <= 1 ? "Starts tomorrow" : `Starts in ${days} days`
  }
  if (phase === "ended") return "Ended"
  const days = Math.floor((+new Date(q.endsAt) - +now) / DAY)
  return days < 1 ? "Last day" : days === 1 ? "1 day left" : `${days} days left`
}
