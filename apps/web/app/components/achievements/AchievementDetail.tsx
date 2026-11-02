"use client"
import { FC } from 'react'
import moment from 'moment'
import { Check, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AchievementItem } from '@/app/hooks/useAchievements'
import Modal from '../modals/Modal'
import Medal from './Medal'
import { MEDAL_INK, getMedalColour, getTierPillClass } from './achievementTheme'
import { formatNumber, formatPill, summarise } from './achievementProgress'

interface AchievementDetailProps {
  achievement: AchievementItem | null
  onClose: () => void
  // Someone else's medals: earned rungs only, without progress towards the next (their numbers aren't shared).
  readOnly?: boolean
}

const formatEarned = (date: string) => moment(date).format(moment(date).isSame(moment(), 'year') ? "D MMM" : "D MMM YYYY")

const AchievementDetail: FC<AchievementDetailProps> = ({ achievement, onClose, readOnly = false }) => {
  if (!achievement) return null
  const { earned, highest, next, percent, total } = summarise(achievement)
  const colour = getMedalColour(achievement.key)
  const towardsNext = next ? Math.min(achievement.current, next.value) : 0

  const body = (
    <div className="w-full px-6 pb-6">
      <div className="flex items-center gap-5">
        <Medal
          achievementKey={achievement.key}
          earned={earned.length > 0}
          pill={formatPill(highest?.value ?? achievement.milestones[0].value)}
          pillClassName={getTierPillClass(earned.length, total)}
          className="w-20 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-snug">{highest ? highest.title : "Not started yet"}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{earned.length} of {total} milestones earned</p>
          {next ? !readOnly && (
            <div className="mt-3">
              <div className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                <span className="truncate">Next: {next.title}</span>
                <span className="shrink-0">{formatNumber(towardsNext)} / {formatNumber(next.value)}</span>
              </div>
              <div
                role="progressbar"
                aria-label={`Progress to ${next.title}`}
                aria-valuenow={towardsNext}
                aria-valuemin={0}
                aria-valuemax={next.value}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
              >
                <div className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm font-medium">Every milestone earned.{readOnly ? "" : " Wonderful."}</p>
          )}
        </div>
      </div>

      <ol className="mt-7 flex flex-col">
        {achievement.milestones.map((m, i) => {
          const isNext = next?.value === m.value
          const isLast = i === achievement.milestones.length - 1
          return (
            <li key={m.value} className="relative flex gap-4 pb-5 last:pb-0">
              {/* The rail between rungs fills in with the medal colour as they're earned. */}
              {!isLast && (
                <span
                  aria-hidden
                  className={cn("absolute left-[15px] top-8 bottom-0 w-0.5", !m.earned && "bg-neutral-200 dark:bg-neutral-800")}
                  style={m.earned ? { background: colour } : undefined}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 grid size-8 shrink-0 place-items-center rounded-full",
                  !m.earned && !isNext && "border-2 border-neutral-200 bg-background text-neutral-400 dark:border-neutral-800 dark:text-neutral-600",
                  isNext && "border-2 border-foreground bg-background text-foreground"
                )}
                style={m.earned ? { background: colour, color: MEDAL_INK } : undefined}
              >
                {m.earned
                  ? <Check size={16} strokeWidth={3} />
                  : isNext
                    ? <span className="text-[11px] font-semibold tabular-nums">{formatPill(m.value)}</span>
                    : <Lock size={13} />}
              </span>
              <div className={cn("min-w-0 flex-1 pt-1", !m.earned && !isNext && "opacity-60")}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium leading-tight">{m.title}</p>
                  <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {m.earned
                      ? (m.earnedAt ? `Earned ${formatEarned(m.earnedAt)}` : "Earned")
                      : isNext && !readOnly ? `${formatNumber(towardsNext)} / ${formatNumber(m.value)}` : null}
                  </p>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>
              </div>
              <span className="sr-only">{m.earned ? "Earned" : isNext ? "In progress" : "Locked"}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )

  return <Modal isOpen onClose={onClose} title={achievement.title} body={body} compact size="sm" />
}

export default AchievementDetail
