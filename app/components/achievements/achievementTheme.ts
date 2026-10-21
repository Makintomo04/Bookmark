export type AchievementCategory = "reading" | "consistency" | "engagement" | string

interface CategoryTheme {
  gradient: string
  ring: string
}

const THEMES: Record<string, CategoryTheme> = {
  reading: { gradient: "from-indigo-400 to-indigo-600", ring: "ring-indigo-400/40" },
  consistency: { gradient: "from-orange-400 to-amber-600", ring: "ring-orange-400/40" },
  engagement: { gradient: "from-rose-400 to-pink-600", ring: "ring-rose-400/40" },
}

const DEFAULT_THEME: CategoryTheme = { gradient: "from-amber-400 to-amber-600", ring: "ring-amber-400/40" }

export function getCategoryTheme(category: AchievementCategory): CategoryTheme {
  return THEMES[category] ?? DEFAULT_THEME
}
