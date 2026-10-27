"use client"
import { FC } from 'react'
import { buildEarnMoment, type EarnMomentInput } from '@bookmark/shared/earnMoment'
import { useEarnMoment } from '@/app/hooks/useEarnMoment'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'

const year = new Date().getFullYear()
const SAMPLES: { label: string, input: EarnMomentInput }[] = [
  { label: "One medal", input: { awarded: [{ achievementKey: "PAGES_READ", value: 1000 }], stats: {}, earnedKeys: [] } },
  {
    label: "Several medals",
    input: { awarded: [{ achievementKey: "BIG_BOOKS", value: 300 }, { achievementKey: "REVIEWS", value: 1 }, { achievementKey: "BOOKS_READ", value: 1 }], stats: {}, earnedKeys: [], finished: true, goal: { year, books: 1, target: 24 } },
  },
  { label: "Tier-up", input: { awarded: [{ achievementKey: "BOOKS_READ", value: 50 }], stats: {}, earnedKeys: [], finished: true, goal: { year, books: 31, target: 52 } } },
]

// Dev-only: opens the medal celebration with sample medals, so each state can be checked without
// earning anything. Nothing is saved; Share links point at your real profile, so they only resolve for medals you hold.
const CelebrationPreviewControls: FC = () => {
  const show = useEarnMoment((s) => s.show)

  return (
    <section className="mt-8 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
      <h2 className="font-semibold">Preview the medal celebration</h2>
      <p className="mt-1 text-sm text-muted-foreground">Opens it with sample medals. Nothing is saved.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <button key={s.label} type="button" onClick={() => show(buildEarnMoment(s.input))} className={secondaryButtonClass}>{s.label}</button>
        ))}
      </div>
    </section>
  )
}

export default CelebrationPreviewControls
