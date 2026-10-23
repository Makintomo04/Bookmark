"use client"
import { FC } from 'react'
import moment from 'moment'
import { AchievementItem } from '@/app/hooks/useAchievements'
import { questCountdown } from '@/lib/questRules'
import { BACKING_PATH } from './AchievementBadge'
import QuestMedal from './QuestMedal'
import { formatNumber } from './achievementProgress'

interface QuestBadgeProps {
  achievement: AchievementItem
  onSelect: () => void
}

// A quest medal in the achievements grid. Same Bookmark-shaped backing as the ladders, tinted with
// the quest's ribbon so the limited editions stand apart.
const QuestBadge: FC<QuestBadgeProps> = ({ achievement, onSelect }) => {
  const quest = achievement.quest!
  const rung = achievement.milestones[0]
  const towards = Math.min(achievement.current, rung.value)
  const percent = rung.earned ? 100 : Math.round((towards / rung.value) * 100)
  const status = rung.earned
    ? `Earned ${moment(rung.earnedAt ?? undefined).format("MMM YYYY")}`
    : questCountdown(quest)

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${achievement.title}: ${rung.earned ? "earned" : `${towards} of ${rung.value} books`}. View quest medal`}
        className="group flex w-full flex-col items-center rounded-xl p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative w-full max-w-[120px] aspect-[5/6] transition-transform duration-200 group-hover:-translate-y-0.5">
          <svg viewBox="0 0 100 120" aria-hidden className="absolute inset-0 h-full w-full">
            <path d={BACKING_PATH} className="fill-neutral-100 dark:fill-neutral-900" />
            <path d={BACKING_PATH} fill={quest.ribbon} fillOpacity={0.14} className="transition-opacity group-hover:opacity-80" />
          </svg>
          <QuestMedal
            design={quest}
            earned={rung.earned}
            className="absolute left-1/2 top-[9%] w-[62%] -translate-x-1/2"
          />
        </div>

        <p className="mt-2 text-sm font-medium leading-snug line-clamp-2">{achievement.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Limited edition · {status}</p>
        {!rung.earned && (
          <div className="mt-2 flex w-full max-w-[120px] items-center gap-1.5" aria-hidden>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div className="h-full rounded-full" style={{ width: `${percent}%`, background: quest.colour }} />
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">{formatNumber(towards)}/{formatNumber(rung.value)}</span>
          </div>
        )}
      </button>
    </li>
  )
}

export default QuestBadge
