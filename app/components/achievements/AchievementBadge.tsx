"use client"
import { FC } from 'react'
import moment from 'moment'
import { cn } from '@/lib/utils'
import { getAchievementIcon } from './achievementIcons'
import { MEDAL_INK, getMedalColour, shade } from './achievementTheme'

// The Bookmark logo stood upright: rounded top corners, and a bottom edge that
// rises to a rounded notch, so every badge hangs on the brand's own shape.
const BACKING_PATH = "M14 0H86C93.7 0 100 6.3 100 14V106Q100 120 87 114.8L55.6 102.2Q50 100 44.4 102.2L13 114.8Q0 120 0 106V14C0 6.3 6.3 0 14 0Z"

export interface AchievementBadgeProps {
  achievementKey: string
  title: string
  description: string
  threshold: number | null
  earned: boolean
  earnedAt?: string | null
  progress?: { current: number; target: number } | null
}

const AchievementBadge: FC<AchievementBadgeProps> = ({ achievementKey, title, description, threshold, earned, earnedAt, progress }) => {
  const Icon = getAchievementIcon(achievementKey)
  const colour = getMedalColour(achievementKey)
  const pill = threshold ?? new Date().getFullYear()
  const percent = progress && progress.target > 0 ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0

  return (
    <li className="flex flex-col items-center text-center">
      <div className="relative w-full max-w-[120px] aspect-[5/6]">
        <svg viewBox="0 0 100 120" aria-hidden className="absolute inset-0 h-full w-full">
          <path d={BACKING_PATH} className="fill-neutral-100 dark:fill-neutral-900" />
        </svg>

        <div className="absolute left-1/2 top-[11%] w-[66%] -translate-x-1/2">
          <div className={cn("relative aspect-square", !earned && "grayscale opacity-40")}>
            <svg viewBox="0 0 100 100" aria-hidden className="block h-full w-full">
              <circle cx="50" cy="50" r="50" fill={shade(colour)} />
              <circle cx="50" cy="50" r="44" fill={colour} />
              <circle cx="50" cy="50" r="36.5" fill="none" stroke={MEDAL_INK} strokeOpacity="0.45" strokeWidth="1.5" />
            </svg>
            <div className="absolute inset-[30%]" aria-hidden>
              <Icon className="h-full w-full" strokeWidth={1.75} color={MEDAL_INK} />
            </div>
          </div>
          <span aria-hidden className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 rounded-full bg-neutral-600 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
            {pill}
          </span>
        </div>
      </div>

      <p className="mt-2 text-sm font-medium leading-snug line-clamp-2">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {earned
          ? (earnedAt ? `Earned ${moment(earnedAt).format(moment(earnedAt).isSame(moment(), 'year') ? "D MMM" : "MMM YYYY")}` : "Earned")
          : description}
      </p>
      {!earned && progress && progress.target > 0 && (
        <div className="mt-2 flex w-full max-w-[120px] items-center gap-1.5">
          <div
            role="progressbar"
            aria-label={`${title} progress`}
            aria-valuenow={progress.current}
            aria-valuemin={0}
            aria-valuemax={progress.target}
            className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
          >
            <div className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">{progress.current}/{progress.target}</span>
        </div>
      )}
      <span className="sr-only">{earned ? "Earned" : "Not earned yet"}</span>
    </li>
  )
}

export default AchievementBadge
