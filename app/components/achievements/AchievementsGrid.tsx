"use client"
import { FC } from 'react'
import AchievementBadge from './AchievementBadge'

interface AchievementItem {
  key: string;
  title: string;
  description: string;
  category: string;
  threshold: number | null;
  earned: boolean;
  earnedAt?: string | null;
  progress?: { current: number; target: number } | null;
}

interface AchievementsGridProps {
  achievements: AchievementItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  reading: "Reading",
  consistency: "Consistency",
  engagement: "Engagement",
}

const CATEGORY_ORDER = ["reading", "consistency", "engagement"]

const AchievementsGrid: FC<AchievementsGridProps> = ({ achievements }) => {
  return (
    <div className="flex flex-col gap-10 w-full">
      {CATEGORY_ORDER.map((category) => {
        const items = achievements.filter((a) => a.category === category)
        if (items.length === 0) return null
        const earnedInCategory = items.filter((a) => a.earned).length
        const headingId = `achievements-${category}`
        return (
          <section key={category} aria-labelledby={headingId}>
            <div className="flex items-baseline justify-between mb-4">
              <h3 id={headingId} className="text-base font-semibold">{CATEGORY_LABELS[category] ?? category}</h3>
              <p className="text-sm text-muted-foreground tabular-nums">{earnedInCategory} of {items.length} earned</p>
            </div>
            <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-3 gap-y-7">
              {items.map((a) => (
                <AchievementBadge
                  key={a.key}
                  achievementKey={a.key}
                  title={a.title}
                  description={a.description}
                  threshold={a.threshold}
                  earned={a.earned}
                  earnedAt={a.earnedAt}
                  progress={a.progress}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export default AchievementsGrid
