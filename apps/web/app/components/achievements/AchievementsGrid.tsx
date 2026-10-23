"use client"
import { FC } from 'react'
import { AchievementItem } from '@/app/hooks/useAchievements'
import AchievementBadge from './AchievementBadge'

interface AchievementsGridProps {
  achievements: AchievementItem[];
  onSelect: (key: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  reading: "Reading",
  consistency: "Consistency",
  engagement: "Engagement",
}

const CATEGORY_ORDER = ["reading", "consistency", "engagement"]

export const GRID_COLUMNS = "grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"

const AchievementsGrid: FC<AchievementsGridProps> = ({ achievements, onSelect }) => {
  return (
    <div className="flex flex-col gap-12 w-full">
      {CATEGORY_ORDER.map((category) => {
        const items = achievements.filter((a) => a.category === category)
        if (items.length === 0) return null
        const milestones = items.flatMap((a) => a.milestones)
        const earnedInCategory = milestones.filter((m) => m.earned).length
        const headingId = `achievements-${category}`
        return (
          <section key={category} aria-labelledby={headingId}>
            <div className="flex items-baseline justify-between mb-4">
              <h2 id={headingId} className="text-lg font-semibold">{CATEGORY_LABELS[category] ?? category}</h2>
              <p className="text-sm text-muted-foreground tabular-nums">
                {`${earnedInCategory} of ${milestones.length} milestones`}
              </p>
            </div>
            <ul className={`${GRID_COLUMNS} gap-x-3 gap-y-7`}>
              {items.map((a) => <AchievementBadge key={a.key} achievement={a} onSelect={() => onSelect(a.key)} />)}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export default AchievementsGrid
