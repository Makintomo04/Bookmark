"use client"
import { FC } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { countsUp, toNextText } from '@/lib/achievements-catalog'
import { AchievementItem } from '@/app/hooks/useAchievements'
import Medal from './Medal'
import { getAchievementIcon } from './achievementIcons'
import { getMedalColour } from './achievementTheme'
import { summarise } from './achievementProgress'

// A medal at list size: the real medal once a rung is earned, otherwise a dashed outline of it, so
// what's still to earn reads as a goal rather than a greyed-out mistake.
export const MedalMark: FC<{ achievementKey: string; earned: boolean; className?: string }> = ({ achievementKey, earned, className }) => {
  if (earned) return <Medal achievementKey={achievementKey} earned className={cn("shrink-0", className)} />
  const Icon = getAchievementIcon(achievementKey)
  return (
    <span aria-hidden className={cn("grid aspect-square shrink-0 place-items-center rounded-full border-2 border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500", className)}>
      <Icon className="size-[45%]" strokeWidth={1.75} />
    </span>
  )
}

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

// Every achievement as a row: medal, what it's for, where it stands, and a dot per rung.
// `heading` and `readOnly` are for another reader's medals (/u/<username>/achievements).
const MedalList: FC<{ achievements: AchievementItem[]; onSelect: (key: string) => void; heading?: string; readOnly?: boolean }> = ({ achievements, onSelect, heading = "Your medals", readOnly = false }) => {
  const earnedCount = achievements.reduce((n, a) => n + a.milestones.filter((m) => m.earned).length, 0)
  return (
    <section aria-labelledby="medals-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="medals-heading" className="text-lg font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground tabular-nums">{earnedCount} earned</p>
      </div>
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {achievements.map((a) => {
          const { earned, total } = summarise(a)
          const colour = getMedalColour(a.key)
          return (
            <li key={a.key}>
              <button
                type="button"
                onClick={() => onSelect(a.key)}
                aria-label={`${a.title}: ${earned.length} of ${total} milestones earned. ${standing(a, readOnly)}. View milestones`}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-neutral-900"
              >
                <MedalMark achievementKey={a.key} earned={earned.length > 0} className="w-11" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.title}</span>
                  <span className="block text-sm text-muted-foreground">{standing(a, readOnly)}</span>
                </span>
                <span aria-hidden className="hidden shrink-0 gap-1 min-[420px]:flex">
                  {a.milestones.map((m) => (
                    <span key={m.value} className={cn("size-2 rounded-full", !m.earned && "border border-neutral-300 dark:border-neutral-700")}
                      style={m.earned ? { background: colour } : undefined} />
                  ))}
                </span>
                <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default MedalList
