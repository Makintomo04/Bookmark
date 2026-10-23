"use client"
import { FC } from 'react'
import Link from 'next/link'
import moment from 'moment'
import { ArrowRight } from 'lucide-react'
import { AchievementItem } from '@/app/hooks/useAchievements'
import { questCountdown, questDates } from '@/lib/questRules'
import Modal from '../modals/Modal'
import QuestMedal from './QuestMedal'
import { formatNumber } from './achievementProgress'

interface QuestDetailProps {
  achievement: AchievementItem
  onClose: () => void
}

const QuestDetail: FC<QuestDetailProps> = ({ achievement, onClose }) => {
  const quest = achievement.quest!
  const rung = achievement.milestones[0]
  const towards = Math.min(achievement.current, rung.value)
  const percent = rung.earned ? 100 : Math.round((towards / rung.value) * 100)

  const body = (
    <div className="w-full px-6 pb-6">
      <div className="flex items-center gap-5">
        <QuestMedal design={quest} earned={rung.earned} className="w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Limited-edition quest medal</p>
          <p className="mt-1 text-lg font-semibold leading-snug">{rung.earned ? "Earned. It's yours for good." : rung.description}</p>
          <p className="text-sm text-muted-foreground">
            {rung.earned && rung.earnedAt ? `Earned ${moment(rung.earnedAt).format("D MMM YYYY")} · ` : ""}{questDates(quest.startsAt, quest.endsAt)}
          </p>
          {!rung.earned && (
            <div className="mt-3">
              <div className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                <span>{questCountdown(quest)}</span>
                <span>{formatNumber(towards)} / {formatNumber(rung.value)}</span>
              </div>
              <div
                role="progressbar"
                aria-label={`Progress on ${achievement.title}`}
                aria-valuenow={towards}
                aria-valuemin={0}
                aria-valuemax={rung.value}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
              >
                <div className="h-full rounded-full" style={{ width: `${percent}%`, background: quest.colour }} />
              </div>
            </div>
          )}
        </div>
      </div>
      {rung.earned && <p className="mt-5 text-sm text-muted-foreground">{rung.description}.</p>}
      <Link href={`/quests/${quest.slug}`} onClick={onClose} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
        See the quest <ArrowRight size={14} aria-hidden />
      </Link>
    </div>
  )

  return <Modal isOpen onClose={onClose} title={achievement.title} body={body} compact size="sm" />
}

export default QuestDetail
