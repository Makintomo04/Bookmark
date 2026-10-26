import { FC } from 'react'
import { cn } from '@/lib/utils'
import Medal from './Medal'
import { getAchievementIcon } from './achievementIcons'
import { getMedalColour } from './achievementTheme'

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

interface MedalRingProps {
  achievementKey: string
  earned: boolean
  // How far towards the next rung, 0–100. A finished ladder is a full ring.
  percent: number
  // Given a label, the ring is announced as a progress bar; otherwise the caller describes it.
  label?: string
  className?: string
}

const R = 46
const CIRCUMFERENCE = 2 * Math.PI * R

// The medal inside a ring in its own colour that fills towards the next rung. Not started yet, it's
// the dashed outline inside an empty ring: a goal, never a padlock.
const MedalRing: FC<MedalRingProps> = ({ achievementKey, earned, percent, label, className }) => {
  const clamped = Math.max(0, Math.min(100, percent))
  // A sliver of ring for any progress at all, so "started" never looks like "not started".
  const shown = clamped > 0 ? Math.max(clamped, 4) : 0
  return (
    <span
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(clamped) : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("relative block aspect-square shrink-0", className)}>
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="4" className="stroke-neutral-200 dark:stroke-neutral-800" />
        {shown > 0 && (
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="4" strokeLinecap="round" stroke={getMedalColour(achievementKey)}
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - shown / 100)} />
        )}
      </svg>
      <MedalMark achievementKey={achievementKey} earned={earned} className="absolute inset-[12%] w-auto" />
    </span>
  )
}

export default MedalRing
