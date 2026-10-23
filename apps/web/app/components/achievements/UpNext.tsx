"use client"
import { FC } from 'react'
import { closestMilestones, toNextText } from '@/lib/achievements-catalog'
import { AchievementItem } from '@/app/hooks/useAchievements'
import { MedalMark } from './MedalList'
import { getMedalColour } from './achievementTheme'

// The three rungs the reader is closest to, each with what's left in plain words.
const UpNext: FC<{ achievements: AchievementItem[]; onSelect: (key: string) => void }> = ({ achievements, onSelect }) => {
  const closest = closestMilestones(achievements)
  if (closest.length === 0) return null
  return (
    <section aria-labelledby="up-next-heading">
      <h2 id="up-next-heading" className="mb-3 text-lg font-semibold">Up next</h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {closest.map(({ ladder, next, progress }) => (
          <li key={ladder.key}>
            <button
              type="button"
              onClick={() => onSelect(ladder.key)}
              className="flex h-full w-full flex-col rounded-2xl border border-neutral-200 p-4 text-left transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              <span className="flex items-center gap-3">
                <MedalMark achievementKey={ladder.key} earned={ladder.milestones.some((m) => m.earned)} className="w-9" />
                <span className="min-w-0">
                  <span className="block font-medium leading-tight">{next.title}</span>
                  <span className="block text-xs text-muted-foreground">{ladder.title}</span>
                </span>
              </span>
              <span className="mt-auto block pt-4">
                <span role="progressbar" aria-label={`Progress to ${next.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}
                  className="block h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(progress * 100, progress > 0 ? 4 : 0)}%`, background: getMedalColour(ladder.key) }} />
                </span>
                <span className="mt-2 block text-sm text-muted-foreground">{toNextText(ladder.key, ladder.current, next.value)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default UpNext
