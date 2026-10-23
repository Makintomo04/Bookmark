import { FC } from 'react'
import Link from 'next/link'
import { EyeOff } from 'lucide-react'
import QuestMedal from '../achievements/QuestMedal'
import { QuestMedalDesign, questCountdown, questDates, questPhase } from '@/lib/questRules'

export interface QuestCardData {
  slug: string
  title: string
  startsAt: string | Date
  endsAt: string | Date
  goalText: string
  design: QuestMedalDesign
  hidden: boolean
  earnedCount: number
  // Only for a signed-in reader: whether they hold the medal.
  earned?: boolean
}

// One quest in the /quests listing. Server-rendered, so it can sit in any section.
const QuestCard: FC<{ quest: QuestCardData }> = ({ quest }) => {
  const phase = questPhase(quest)
  const n = quest.earnedCount
  const footer = phase === "ended"
    ? `Ended: ${n.toLocaleString("en-GB")} ${n === 1 ? "reader" : "readers"} earned this`
    : phase === "live" && n > 0
      ? `${questCountdown(quest)} · ${n.toLocaleString("en-GB")} earned so far`
      : questCountdown(quest)

  return (
    <Link
      href={`/quests/${quest.slug}`}
      className="group flex items-center gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 transition hover:bg-neutral-50 dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <QuestMedal design={quest.design} earned={phase !== "ended" || !!quest.earned} className="w-16 shrink-0 transition-transform group-hover:-translate-y-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold">{quest.title}</h3>
          {quest.hidden && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><EyeOff size={11} aria-hidden />Draft</span>}
          {quest.earned && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: quest.design.colour, color: "#FBF1DF" }}>Earned</span>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{quest.goalText}</p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">{questDates(quest.startsAt, quest.endsAt)} · {footer}</p>
      </div>
    </Link>
  )
}

export default QuestCard
