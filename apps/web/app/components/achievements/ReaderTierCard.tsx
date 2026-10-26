"use client"
import { FC } from 'react'
import { achievementCounts, achievementCountsLine } from '@bookmark/shared/achievementCounts'
import { cn } from '@/lib/utils'
import { READER_TIERS, booksReadOf, tierProgress, type ReaderTier } from '@/lib/readerTier'
import useUser from '@/app/hooks/useUser'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import type { AchievementItem } from '@/app/hooks/useAchievements'

const metal = (t: ReaderTier) => `linear-gradient(135deg, ${t.light}, ${t.colour} 45%, ${t.shade})`
const fmt = (n: number) => n.toLocaleString('en-GB')

// Where the reader sits on the tier ladder, and what the next rung takes. The user menu's tier card links here.
// Before Bronze there's no metal to show, so the swatch is the next tier's outline with the books still to go.
// Under the ladder, one quiet line of medal counts from the achievements the page already has.
// Pass `reader` to show someone else's (their achievements page); otherwise it's the signed-in reader's.
const ReaderTierCard: FC<{ achievements: AchievementItem[]; reader?: { username: string; booksRead: number } }> = ({ achievements, reader }) => {
  const { user } = useUser()
  const booksReadFor = useBooksReadFor()
  if (!reader && !user) return null

  const booksRead = reader ? reader.booksRead : booksReadFor(user!.username, booksReadOf(user!))
  const { tier, next, remaining } = tierProgress(booksRead)

  const heading = tier ? `${tier.label} reader` : `On ${reader ? "their" : "your"} way to ${next!.label}`
  const detail = !tier
    ? `${fmt(booksRead)} of ${fmt(next!.minBooks)} books read.${reader ? "" : " Your tier frames your avatar wherever your name appears."}`
    : next
      ? `${fmt(booksRead)} books read · ${fmt(remaining)} more to ${next.label}`
      : `${fmt(booksRead)} books read · you've reached the top tier`

  return (
    <section id="tier" aria-labelledby="tier-heading" className="scroll-mt-24 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6">
      <div className="flex items-center gap-4">
        {tier ? (
          <div aria-hidden className="relative size-14 shrink-0 overflow-hidden rounded-xl" style={{ background: metal(tier) }}>
            {tier.shimmer && <div className={cn("tier-shimmer absolute inset-0", tier.key === "diamond" && "tier-shimmer-diamond")} />}
          </div>
        ) : (
          <div aria-hidden className="grid size-14 shrink-0 place-content-center rounded-xl border-2 border-dashed text-center leading-none"
            style={{ borderColor: next!.colour, color: next!.colour }}>
            <span className="text-lg font-bold tabular-nums">{fmt(remaining)}</span>
            <span className="mt-0.5 text-[11px] font-medium">to go</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 id="tier-heading" className="text-lg font-semibold">{heading}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">{detail}</p>
        </div>
      </div>

      {/* One segment per tier, each filling from the tier before it, so a reader with four books still sees
          progress instead of a sliver of a 500-book bar. */}
      <ol className="mt-5 grid grid-cols-5 gap-1.5">
        {READER_TIERS.map((t, i) => {
          const from = i === 0 ? 0 : READER_TIERS[i - 1].minBooks
          const fill = Math.max(0, Math.min(1, (booksRead - from) / (t.minBooks - from)))
          const reached = booksRead >= t.minBooks
          return (
            <li key={t.key} aria-current={t.key === tier?.key ? "step" : undefined}>
              <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                {fill > 0 && <div className="h-full rounded-full" style={{ width: `${fill * 100}%`, background: metal(t) }} />}
              </div>
              <p className={cn("mt-1.5 text-xs font-medium", !reached && "text-muted-foreground")}>{t.label}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">{fmt(t.minBooks)}<span className="max-sm:sr-only"> books</span></p>
              <span className="sr-only">{reached ? "reached" : "not reached yet"}</span>
            </li>
          )
        })}
      </ol>

      <p className="mt-4 text-sm text-muted-foreground tabular-nums">{achievementCountsLine(achievementCounts(achievements))}</p>
    </section>
  )
}

export default ReaderTierCard
