import { ACHIEVEMENTS, LEGACY_KEYS, getMilestone, milestoneKey } from "./achievements-catalog"

// The medals a profile shows off, shared so the web header, the share image and the mobile profile
// pick the same three. No database access: callers pass the earned milestone keys they already have.

export interface TopMedal {
  // The ladder ("BOOKS_READ"), which picks the medal's colour and icon.
  key: string
  // The highest rung's title, e.g. "Bibliophile".
  title: string
  // The ladder's title, e.g. "Books read".
  achievement: string
  rung: number
  // Share of the ladder climbed, 0 to 1.
  progress: number
}

// Each achievement's highest earned rung, best first: the furthest up its ladder, then the later rung.
export function topMedals(earned: { key: string }[], limit = 3): TopMedal[] {
  const best = new Map<string, TopMedal>()
  for (const { key } of earned) {
    const found = getMilestone(key)
    if (!found) continue
    const { achievement, milestone } = found
    const rung = achievement.milestones.indexOf(milestone)
    if ((best.get(achievement.key)?.rung ?? -1) >= rung) continue
    best.set(achievement.key, {
      key: achievement.key,
      title: milestone.title,
      achievement: achievement.title,
      rung,
      progress: (rung + 1) / achievement.milestones.length,
    })
  }
  return Array.from(best.values()).sort((a, b) => b.progress - a.progress || b.rung - a.rung).slice(0, limit)
}

export interface LadderMilestone {
  value: number
  title: string
  description: string
  earned: boolean
  earnedAt: string | null
}

export interface Ladder {
  key: string
  title: string
  category: string
  current: number
  milestones: LadderMilestone[]
}

// Every ladder as the achievements page draws it, from the earned rungs and each ladder's number.
// Without `stats` (someone else's medals), `current` is the highest rung earned: the medals already
// say that much, and the real counts can include private books, reviews and goals.
export function ladders(
  earned: { key: string; earnedAt: Date | string | null }[],
  stats: Partial<Record<string, number>> | null,
): Ladder[] {
  // A reader who hasn't been back since milestones arrived may still have pre-milestone keys.
  const earnedAt = new Map(earned.map((e) => [LEGACY_KEYS[e.key] ?? e.key, e.earnedAt]))
  return ACHIEVEMENTS.map((a) => {
    const milestones = a.milestones.map((m) => {
      const key = milestoneKey(a.key, m.value)
      const at = earnedAt.get(key)
      return {
        value: m.value,
        title: m.title,
        description: a.describe(m.value),
        earned: earnedAt.has(key),
        earnedAt: at ? new Date(at).toISOString() : null,
      }
    })
    const reached = milestones.filter((m) => m.earned).pop()?.value ?? 0
    return { key: a.key, title: a.title, category: a.category, current: stats ? stats[a.key] ?? 0 : reached, milestones }
  })
}
