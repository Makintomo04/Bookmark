import { AchievementItem } from '@/app/hooks/useAchievements'

const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 })
const full = new Intl.NumberFormat("en-GB")

// "100K" fits on a medal pill; "100,000" doesn't.
export const formatPill = (n: number) => (n >= 10000 ? compact.format(n) : full.format(n))
export const formatNumber = (n: number) => full.format(n)

export function summarise(achievement: AchievementItem) {
  const { milestones, current } = achievement
  const earned = milestones.filter((m) => m.earned)
  const highest = earned[earned.length - 1] ?? null
  const next = milestones.find((m) => !m.earned) ?? null
  const percent = next ? Math.max(0, Math.min(100, Math.round((current / next.value) * 100))) : 100
  return { earned, highest, next, percent, total: milestones.length }
}
