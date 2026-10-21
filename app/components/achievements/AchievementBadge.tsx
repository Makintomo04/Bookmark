"use client"
import { FC } from 'react'
import { AchievementItem } from '@/app/hooks/useAchievements'
import Medal from './Medal'
import { getTierPillClass } from './achievementTheme'
import { formatNumber, formatPill, summarise } from './achievementProgress'

// The Bookmark logo stood upright: rounded top corners, and a bottom edge that
// rises to a rounded notch, so every badge hangs on the brand's own shape.
export const BACKING_PATH = "M14 0H86C93.7 0 100 6.3 100 14V106Q100 120 87 114.8L55.6 102.2Q50 100 44.4 102.2L13 114.8Q0 120 0 106V14C0 6.3 6.3 0 14 0Z"

interface AchievementBadgeProps {
  achievement: AchievementItem
  onSelect: () => void
}

const AchievementBadge: FC<AchievementBadgeProps> = ({ achievement, onSelect }) => {
  const { earned, highest, next, percent, total } = summarise(achievement)
  const pillValue = highest?.value ?? achievement.milestones[0].value

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${achievement.title}: ${earned.length} of ${total} milestones earned. View milestones`}
        className="group flex w-full flex-col items-center rounded-xl p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        <div className="relative w-full max-w-[120px] aspect-[5/6] transition-transform duration-200 group-hover:-translate-y-0.5">
          <svg viewBox="0 0 100 120" aria-hidden className="absolute inset-0 h-full w-full">
            <path d={BACKING_PATH} className="fill-neutral-100 transition-colors group-hover:fill-neutral-200/70 dark:fill-neutral-900 dark:group-hover:fill-neutral-800" />
          </svg>
          <Medal
            achievementKey={achievement.key}
            earned={earned.length > 0}
            pill={formatPill(pillValue)}
            pillClassName={getTierPillClass(earned.length, total)}
            className="absolute left-1/2 top-[11%] w-[66%] -translate-x-1/2"
          />
        </div>

        <p className="mt-2 text-sm font-medium leading-snug line-clamp-2">{highest?.title ?? achievement.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {highest ? `${achievement.title} · ${earned.length} of ${total}` : `${earned.length} of ${total} milestones`}
        </p>
        <div className="mt-2 flex w-full max-w-[120px] items-center gap-1.5" aria-hidden>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
          </div>
          {next && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatPill(Math.min(achievement.current, next.value))}/{formatPill(next.value)}
            </span>
          )}
        </div>
        {!next && <p className="mt-1 text-[11px] font-medium text-muted-foreground">All milestones earned</p>}
        {next && <span className="sr-only">Next: {next.title}, {formatNumber(achievement.current)} of {formatNumber(next.value)}</span>}
      </button>
    </li>
  )
}

export default AchievementBadge
