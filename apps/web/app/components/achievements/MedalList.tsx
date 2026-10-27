"use client"
import { FC } from 'react'
import { countsUp, toNextText } from '@/lib/achievements-catalog'
import { AchievementItem } from '@/app/hooks/useAchievements'
import MedalRing from './MedalRing'
import { summarise } from './achievementProgress'

export { MedalMark } from './MedalRing'

// One line on where a ladder stands: the rung reached and what the next takes, or how to start it.
// readOnly (someone else's medals) leaves out what's next: their real numbers aren't shared.
export function standing(a: AchievementItem, readOnly = false): string {
  const { highest, next, earned, total } = summarise(a)
  if (!next) return `${highest!.title} · every milestone earned`
  if (readOnly) return highest ? `${highest.title} · ${earned.length} of ${total} milestones` : "Not started yet"
  if (!highest) return `${toNextText(a.key, a.current, next.value)} to earn ${next.title}`
  return countsUp(a.key)
    ? `${highest.title} · ${next.title} in ${toNextText(a.key, a.current, next.value)}`
    : `${highest.title} · next, ${next.title}`
}

const CATEGORIES = [
  { key: "reading", title: "Reading" },
  { key: "consistency", title: "Consistency" },
  { key: "engagement", title: "Engagement" },
]

// Every achievement as a tile in a grid, grouped by category: the ring medal, the rung reached and
// how many of the ladder's rungs are earned. `heading` and `readOnly` are for another reader's medals
// (/u/<username>/achievements): their progress towards the next rung isn't shared, so the ring stays empty.
const MedalList: FC<{ achievements: AchievementItem[]; onSelect: (key: string) => void; heading?: string; readOnly?: boolean }> = ({ achievements, onSelect, heading = "Your medals", readOnly = false }) => {
  const earnedCount = achievements.reduce((n, a) => n + a.milestones.filter((m) => m.earned).length, 0)
  return (
    <section aria-labelledby="medals-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="medals-heading" className="text-lg font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground tabular-nums">{earnedCount} earned</p>
      </div>
      <div className="flex flex-col gap-6">
        {CATEGORIES.map((category) => {
          const ladders = achievements.filter((a) => a.category === category.key)
          if (ladders.length === 0) return null
          return (
            <div key={category.key} role="group" aria-labelledby={`medals-${category.key}`}>
              <h3 id={`medals-${category.key}`} className="mb-2 text-sm font-medium text-muted-foreground">{category.title}</h3>
              <ul className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 md:grid-cols-4">
                {ladders.map((a) => {
                  const { earned, highest, percent, total } = summarise(a)
                  return (
                    <li key={a.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(a.key)}
                        aria-label={`${a.title}: ${earned.length} of ${total} milestones earned. ${standing(a, readOnly)}. View milestones`}
                        className="flex h-full w-full flex-col items-center rounded-2xl border border-neutral-200 px-3 pb-3 pt-4 text-center transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-neutral-800 dark:hover:bg-neutral-900"
                      >
                        <MedalRing achievementKey={a.key} earned={earned.length > 0} percent={readOnly ? 0 : percent} className="w-20" />
                        <span className="mt-3 block font-medium leading-tight">{highest ? highest.title : "Not started"}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{a.title}</span>
                        <span className="mt-auto block pt-2 text-xs font-medium tabular-nums text-muted-foreground">{earned.length}/{total}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default MedalList
