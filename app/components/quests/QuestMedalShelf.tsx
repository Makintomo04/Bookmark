import { FC } from 'react'
import Link from 'next/link'
import QuestMedal from '../achievements/QuestMedal'
import { QuestMedalDesign, questDay } from '@/lib/questRules'

export interface ShelfMedal {
  slug: string
  title: string
  design: QuestMedalDesign
  earnedAt: string | null
}

// A profile's limited-edition quest medals, newest first. Nothing at all when there are none.
const QuestMedalShelf: FC<{ medals: ShelfMedal[], title?: string }> = ({ medals, title = "Quest medals" }) => {
  if (medals.length === 0) return null
  return (
    <section aria-labelledby="quest-medals-heading" className="mt-12">
      <h2 id="quest-medals-heading" className="text-xl font-bold">{title} <span className="font-normal text-muted-foreground tabular-nums">· {medals.length}</span></h2>
      <ul className="mt-4 flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {medals.map((m) => (
          <li key={m.slug} className="w-24 shrink-0">
            <Link href={`/quests/${m.slug}`} className="group flex flex-col items-center gap-2 rounded-xl p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <QuestMedal design={m.design} earned className="w-16 transition-transform group-hover:-translate-y-0.5" />
              <span className="text-xs font-medium leading-snug line-clamp-2">{m.title}</span>
              {m.earnedAt && <span className="sr-only">Earned {questDay(m.earnedAt)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default QuestMedalShelf
