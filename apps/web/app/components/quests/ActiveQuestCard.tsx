import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import QuestMedal from '../achievements/QuestMedal'
import { featuredQuest, goalText, listTitles, medalOf } from '@/lib/quests'
import { questCountdown } from '@/lib/questRules'

// The live seasonal quest, for Discover. Renders nothing between quests.
const ActiveQuestCard = async () => {
  const quest = await featuredQuest()
  if (!quest) return null
  const goal = goalText(quest, await listTitles([quest]))
  const design = medalOf(quest)

  return (
    <Link
      href={`/quests/${quest.slug}`}
      className="group relative flex items-center gap-5 overflow-hidden rounded-2xl p-5 sm:p-6 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ background: `radial-gradient(circle at 90% 10%, rgb(255 255 255 / 0.16), transparent 55%), linear-gradient(135deg, ${design.ribbon}, ${design.colour})` }}
    >
      <QuestMedal design={design} earned className="w-16 sm:w-20 shrink-0 drop-shadow-lg transition-transform group-hover:-rotate-6" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/75">Seasonal quest · {questCountdown(quest)}</p>
        <h2 className="mt-1 text-xl sm:text-2xl font-bold leading-tight">{quest.title}</h2>
        <p className="mt-1 text-sm text-white/85 line-clamp-2">{goal} to earn a limited-edition medal.</p>
      </div>
      <ArrowRight size={20} className="hidden sm:block shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
    </Link>
  )
}

export default ActiveQuestCard
