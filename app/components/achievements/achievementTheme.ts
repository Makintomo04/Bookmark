import { AchievementKey } from '@/lib/achievements-catalog'

const MEDAL_COLOURS: Record<AchievementKey, string> = {
  BOOKS_READ: "#C8372D",
  PAGES_READ: "#3E7B4F",
  BIG_BOOKS: "#2C7380",
  STREAK: "#D06A2A",
  GOALS: "#B8892B",
  REVIEWS: "#8A3B5C",
  RATINGS: "#2E4F7A",
  BUDDY_READS_FINISHED: "#5B4B8A",
  BUDDY_READS_HOSTED: "#7A5A2E",
}

export const MEDAL_INK = "#FBF1DF"

export function getMedalColour(key: string) {
  return MEDAL_COLOURS[key as AchievementKey] ?? "#6B6B6B"
}

// The rim is the medal colour pushed towards black, so each medal keeps its own hue.
export function shade(hex: string, amount = 0.3) {
  const n = parseInt(hex.slice(1), 16)
  const channel = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount))
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

// The pill under a medal turns bronze, silver, then gold as the ladder is climbed,
// and black-and-gold once every rung is earned.
export function getTierPillClass(earnedCount: number, total: number) {
  if (earnedCount === 0) return "bg-neutral-600 text-white"
  if (earnedCount >= total) return "bg-neutral-900 text-[#E9C46A] ring-1 ring-[#E9C46A]/60 dark:bg-black"
  const ratio = earnedCount / total
  if (ratio <= 1 / 3) return "bg-[#9A5B2C] text-white"
  if (ratio <= 2 / 3) return "bg-[#7C8894] text-white"
  return "bg-[#B08422] text-white"
}
