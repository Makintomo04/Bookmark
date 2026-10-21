import { AchievementKey } from '@/lib/achievements-catalog'

const MEDAL_COLOURS: Record<AchievementKey, string> = {
  FIRST_BOOKMARK: "#C8372D",
  BOOKWORM: "#3E7B4F",
  BIBLIOPHILE: "#B8892B",
  PAGE_TURNER: "#2C7380",
  GOAL_GETTER: "#D06A2A",
  ON_A_ROLL: "#A4432E",
  DEDICATED_READER: "#2E4F7A",
  FIRST_IMPRESSION: "#8A3B5C",
  CRITIC: "#5E6B2E",
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
