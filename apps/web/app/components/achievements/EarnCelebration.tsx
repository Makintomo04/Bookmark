"use client"
import { FC, useEffect } from 'react'
import Link from 'next/link'
import confetti from 'canvas-confetti'
import { Share2 } from 'lucide-react'
import { finishLine, type EarnedMedal } from '@bookmark/shared/earnMoment'
import { medalSharePath } from '@bookmark/shared/medalShare'
import { useEarnMoment } from '@/app/hooks/useEarnMoment'
import useUser from '@/app/hooks/useUser'
import { notify } from '@/lib/notify'
import { copyText } from '@/lib/copyText'
import Modal from '../modals/Modal'
import Medal from './Medal'
import MedalBand from './MedalBand'
import { getMedalColour } from './achievementTheme'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'

// A short burst in the medals' own colours. canvas-confetti skips it when the reader asks for reduced motion.
function burst(colours: string[]) {
  const shared = { disableForReducedMotion: true, colors: [...colours, '#FBF1DF'], zIndex: 1000, ticks: 220 }
  confetti({ ...shared, particleCount: 90, spread: 75, startVelocity: 42, origin: { x: 0.5, y: 0.35 } })
  setTimeout(() => confetti({ ...shared, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.6 } }), 150)
  setTimeout(() => confetti({ ...shared, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.6 } }), 150)
}

// The lead medal's page, whose link unfurls to that medal's card: the share sheet where there is one, otherwise a copy.
async function shareMedal(username: string, medal: EarnedMedal) {
  const url = `${window.location.origin}${medalSharePath(username, medal.key)}`
  const data = { title: `${medal.title} on Bookmark`, text: `I just earned ${medal.title} on Bookmark`, url }

  if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data)
      return
    } catch (err) {
      // Closing the share sheet isn't a failure, and needs no fallback.
      if (err instanceof DOMException && err.name === "AbortError") return
    }
  }

  try {
    await copyText(url)
    notify.success("Link copied", { description: "It opens a card for this medal." })
  } catch {
    notify.error("Couldn't copy the link.")
  }
}

// The moment a save earns something: the medal (or medals) and a tier-up, with confetti, and where a
// finished book leaves the reader. Mounted once, in the root layout; useEarnMoment opens it.
const EarnCelebration: FC = () => {
  const { moment, clear } = useEarnMoment()
  const { user } = useUser()
  const username: string | null = user?.username ?? null

  useEffect(() => {
    if (moment && moment.medals.length > 0) burst(Array.from(new Set(moment.medals.map((m) => getMedalColour(m.achievementKey)))))
  }, [moment])

  if (!moment || moment.medals.length === 0) return null
  // A tier-up leads with the Books read rung it landed on; otherwise the first medal leads and the rest follow.
  const lead = (moment.tier && moment.medals.find((m) => m.achievementKey === 'BOOKS_READ')) || moment.medals[0]
  const others = moment.medals.filter((m) => m !== lead)
  const line = finishLine(moment)
  const heading = moment.tier ? 'New reader tier' : others.length > 0 ? `${moment.medals.length} medals earned` : 'Medal earned'

  const body = (
    <div className="flex w-full flex-col items-center pb-6 text-center">
      <MedalBand achievementKey={lead.achievementKey} value={lead.value} tierKey={moment.tier?.key} eyebrow={heading} className="mb-5" />

      <div className="flex w-full flex-col items-center px-6">
        <p className="font-display text-2xl font-semibold">{moment.tier ? `${moment.tier.label} reader` : lead.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {moment.tier ? `Your avatar now wears a ${moment.tier.label} frame, and you earned ${lead.title}.` : `${lead.achievementTitle}: ${lead.description.charAt(0).toLowerCase()}${lead.description.slice(1)}.`}
        </p>

        {/* Every other medal earned at once, named and described so none reads as a tag on the first. */}
        {others.length > 0 && (
          <div className="mt-6 w-full text-left">
            <p id="also-earned" className="text-xs font-medium text-muted-foreground">Also earned</p>
            <ul className="mt-2 flex flex-col gap-2" aria-labelledby="also-earned">
              {others.map((m) => (
                <li key={m.key} className="flex items-center gap-3 rounded-xl border border-neutral-200 p-2 pr-3 dark:border-neutral-800">
                  <Medal achievementKey={m.achievementKey} earned pill={String(m.value)} pillClassName="bg-neutral-900 text-white dark:bg-black" className="mb-2 w-11 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{m.title}</span>
                    <span className="block text-xs text-muted-foreground">{m.achievementTitle}: {m.description.charAt(0).toLowerCase()}{m.description.slice(1)}.</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {line && <p className="mt-5 rounded-xl bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">{line}</p>}

        {username && (
          <p className="mt-5 text-sm text-muted-foreground">
            {others.length > 0 ? 'They now show' : 'It now shows'} on <Link href={`/u/${encodeURIComponent(username)}`} onClick={clear} className="font-medium text-foreground underline underline-offset-4 hover:no-underline">your profile</Link>.
          </p>
        )}

        <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" onClick={clear} className={primaryButtonClass}>Lovely</button>
          {username && (
            <button type="button" onClick={() => void shareMedal(username, lead)} className={secondaryButtonClass}>
              <Share2 size={16} aria-hidden />
              Share
            </button>
          )}
          <Link href="/achievements" onClick={clear} className={secondaryButtonClass}>See all medals</Link>
        </div>
      </div>
    </div>
  )

  return <Modal isOpen onClose={clear} title={heading} body={body} compact size="sm" bare />
}

export default EarnCelebration
