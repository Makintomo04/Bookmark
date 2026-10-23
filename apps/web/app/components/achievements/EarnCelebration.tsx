"use client"
import { FC, useEffect } from 'react'
import Link from 'next/link'
import confetti from 'canvas-confetti'
import { finishLine } from '@bookmark/shared/earnMoment'
import { READER_TIERS } from '@/lib/readerTier'
import { useEarnMoment } from '@/app/hooks/useEarnMoment'
import Modal from '../modals/Modal'
import Medal from './Medal'
import { getMedalColour } from './achievementTheme'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'

const metal = (key: string) => {
  const t = READER_TIERS.find((r) => r.key === key)
  return t ? `linear-gradient(135deg, ${t.light}, ${t.colour} 45%, ${t.shade})` : undefined
}

// A short burst in the medals' own colours. canvas-confetti skips it when the reader asks for reduced motion.
function burst(colours: string[]) {
  const shared = { disableForReducedMotion: true, colors: [...colours, '#FBF1DF'], zIndex: 1000, ticks: 220 }
  confetti({ ...shared, particleCount: 90, spread: 75, startVelocity: 42, origin: { x: 0.5, y: 0.35 } })
  setTimeout(() => confetti({ ...shared, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.6 } }), 150)
  setTimeout(() => confetti({ ...shared, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.6 } }), 150)
}

// The moment a save earns something: the medal (or medals) and a tier-up, with confetti, and where a
// finished book leaves the reader. Mounted once, in the root layout; useEarnMoment opens it.
const EarnCelebration: FC = () => {
  const { moment, clear } = useEarnMoment()

  useEffect(() => {
    if (moment && moment.medals.length > 0) burst(Array.from(new Set(moment.medals.map((m) => getMedalColour(m.achievementKey)))))
  }, [moment])

  if (!moment || moment.medals.length === 0) return null
  // A tier-up leads with the Books read rung it landed on; otherwise the first medal leads and the rest follow.
  const lead = (moment.tier && moment.medals.find((m) => m.achievementKey === 'BOOKS_READ')) || moment.medals[0]
  const others = moment.medals.filter((m) => m !== lead)
  const line = finishLine(moment)

  const body = (
    <div className="flex w-full flex-col items-center px-6 pb-6 text-center">
      {moment.tier ? (
        <div aria-hidden className="mb-4 size-20 rounded-2xl" style={{ background: metal(moment.tier.key) }} />
      ) : (
        <Medal achievementKey={lead.achievementKey} earned pill={String(lead.value)} pillClassName="bg-neutral-900 text-white dark:bg-black" className="mb-6 w-24" />
      )}
      <p className="text-2xl font-bold">{moment.tier ? `${moment.tier.label} reader` : lead.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {moment.tier ? `Your avatar now wears a ${moment.tier.label} frame, and you earned ${lead.title}.` : `${lead.achievementTitle}: ${lead.description.charAt(0).toLowerCase()}${lead.description.slice(1)}.`}
      </p>

      {others.length > 0 && (
        <ul className="mt-5 flex flex-wrap justify-center gap-3" aria-label="Also earned">
          {others.map((m) => (
            <li key={m.key} className="flex items-center gap-2 rounded-full border border-neutral-200 py-1 pl-1 pr-3 text-sm dark:border-neutral-800">
              <Medal achievementKey={m.achievementKey} earned className="w-7" />
              {m.title}
            </li>
          ))}
        </ul>
      )}

      {line && <p className="mt-5 rounded-xl bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">{line}</p>}

      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <button type="button" onClick={clear} className={primaryButtonClass}>Lovely</button>
        <Link href="/achievements" onClick={clear} className={secondaryButtonClass}>See all medals</Link>
      </div>
    </div>
  )

  return <Modal isOpen onClose={clear} title={moment.tier ? 'New reader tier' : others.length > 0 ? `${moment.medals.length} medals earned` : 'Medal earned'} body={body} compact size="sm" />
}

export default EarnCelebration
