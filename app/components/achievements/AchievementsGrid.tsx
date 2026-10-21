"use client"
import { FC } from 'react'
import AchievementCard from './AchievementCard'

interface AchievementItem {
  key: string;
  title: string;
  description: string;
  category: string;
  earned: boolean;
  earnedAt?: string | null;
  progress?: { current: number; target: number } | null;
}

interface AchievementsGridProps {
  achievements: AchievementItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  reading: "Reading progress",
  consistency: "Consistency",
  engagement: "Engagement",
}

const CATEGORY_ORDER = ["reading", "consistency", "engagement"]

const AchievementsGrid: FC<AchievementsGridProps> = ({ achievements }) => {
  return (
    <div className="flex flex-col gap-6 w-full">
      {CATEGORY_ORDER.map((category) => {
        const items = achievements.filter((a) => a.category === category)
        if (items.length === 0) return null
        const earnedInCategory = items.filter((a) => a.earned).length
        return (
          <div key={category}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground">{CATEGORY_LABELS[category] ?? category}</h3>
              <p className="text-xs text-muted-foreground">{earnedInCategory}/{items.length}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((a) => (
                <AchievementCard
                  key={a.key}
                  achievementKey={a.key}
                  title={a.title}
                  description={a.description}
                  category={a.category}
                  earned={a.earned}
                  earnedAt={a.earnedAt}
                  progress={a.progress}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default AchievementsGrid
