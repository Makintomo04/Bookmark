// Each achievement is a ladder of milestones on one number (books completed,
// streak length...). A milestone is stored as "<KEY>:<value>", e.g. "BOOKS_READ:25",
// so every rung keeps its own earned date and notification.
export type AchievementKey =
  | "BOOKS_READ"
  | "PAGES_READ"
  | "BIG_BOOKS"
  | "STREAK"
  | "GOALS"
  | "REVIEWS"
  | "RATINGS"

export type AchievementCategory = "reading" | "consistency" | "engagement"

export interface Milestone {
  value: number
  title: string
}

export interface AchievementDefinition {
  key: AchievementKey
  title: string
  category: AchievementCategory
  // What reaching `n` asks of the reader, e.g. "Complete 25 books".
  describe: (n: number) => string
  milestones: Milestone[]
}

const fmt = (n: number) => n.toLocaleString("en-GB")

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    key: "BOOKS_READ",
    title: "Books read",
    category: "reading",
    describe: (n) => (n === 1 ? "Complete your first book" : `Complete ${fmt(n)} books`),
    milestones: [
      { value: 1, title: "First Bookmark" },
      { value: 5, title: "Getting Hooked" },
      { value: 10, title: "Bookworm" },
      { value: 25, title: "Bibliophile" },
      { value: 50, title: "Book Devourer" },
      { value: 100, title: "Centurion" },
      { value: 250, title: "Living Library" },
      { value: 500, title: "Legend of the Stacks" },
    ],
  },
  {
    key: "PAGES_READ",
    title: "Pages read",
    category: "reading",
    describe: (n) => `Read ${fmt(n)} pages`,
    milestones: [
      { value: 1000, title: "Warming Up" },
      { value: 5000, title: "Paper Trail" },
      { value: 10000, title: "Ink Stained" },
      { value: 25000, title: "Paper Mountain" },
      { value: 50000, title: "Marathon Reader" },
      { value: 100000, title: "Ink Ocean" },
    ],
  },
  {
    key: "BIG_BOOKS",
    title: "Big books",
    category: "reading",
    describe: (n) => `Complete a book that's ${fmt(n)}+ pages`,
    milestones: [
      { value: 300, title: "Hefty Read" },
      { value: 500, title: "Page Turner" },
      { value: 750, title: "Doorstopper" },
      { value: 1000, title: "Tome Raider" },
    ],
  },
  {
    key: "STREAK",
    title: "Reading streak",
    category: "consistency",
    describe: (n) => `Stay active for ${fmt(n)} days in a row`,
    milestones: [
      { value: 3, title: "On a Roll" },
      { value: 7, title: "Dedicated Reader" },
      { value: 14, title: "Fortnight Strong" },
      { value: 30, title: "Month of Pages" },
      { value: 100, title: "Unstoppable" },
      { value: 365, title: "Year-Round Reader" },
    ],
  },
  {
    key: "GOALS",
    title: "Goal getter",
    category: "consistency",
    describe: (n) => (n === 1 ? "Meet your yearly reading goal" : `Meet your yearly reading goal ${n} times`),
    milestones: [
      { value: 1, title: "Goal Getter" },
      { value: 2, title: "Back to Back" },
      { value: 3, title: "Hat Trick" },
      { value: 5, title: "Five-Year Plan" },
    ],
  },
  {
    key: "REVIEWS",
    title: "Reviews written",
    category: "engagement",
    describe: (n) => (n === 1 ? "Write your first review" : `Write ${fmt(n)} reviews`),
    milestones: [
      { value: 1, title: "First Impression" },
      { value: 5, title: "Opinionated" },
      { value: 10, title: "Book Reviewer" },
      { value: 25, title: "Literary Voice" },
      { value: 50, title: "Columnist" },
    ],
  },
  {
    key: "RATINGS",
    title: "Books rated",
    category: "engagement",
    describe: (n) => `Rate ${fmt(n)} books`,
    milestones: [
      { value: 5, title: "Starstruck" },
      { value: 10, title: "Critic" },
      { value: 25, title: "Sharp Eye" },
      { value: 50, title: "Tastemaker" },
      { value: 100, title: "Connoisseur" },
    ],
  },
]

// Badges from before milestones existed, and the rung each one became.
export const LEGACY_KEYS: Record<string, string> = {
  FIRST_BOOKMARK: "BOOKS_READ:1",
  BOOKWORM: "BOOKS_READ:10",
  BIBLIOPHILE: "BOOKS_READ:25",
  PAGE_TURNER: "BIG_BOOKS:500",
  GOAL_GETTER: "GOALS:1",
  ON_A_ROLL: "STREAK:3",
  DEDICATED_READER: "STREAK:7",
  FIRST_IMPRESSION: "REVIEWS:1",
  CRITIC: "RATINGS:10",
}

export function milestoneKey(key: AchievementKey, value: number) {
  return `${key}:${value}`
}

export function getAchievement(key: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key)
}

export function getMilestone(storedKey: string): { achievement: AchievementDefinition; milestone: Milestone } | null {
  const [key, raw] = (LEGACY_KEYS[storedKey] ?? storedKey).split(":")
  const achievement = getAchievement(key)
  const milestone = achievement?.milestones.find((m) => m.value === Number(raw))
  return achievement && milestone ? { achievement, milestone } : null
}

export function getAchievementTitle(storedKey: string): string {
  return getMilestone(storedKey)?.milestone.title ?? "an achievement"
}
