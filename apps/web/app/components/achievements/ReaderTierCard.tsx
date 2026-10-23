"use client"
import { FC } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { READER_TIERS, booksReadOf, tierProgress, type ReaderTier } from '@/lib/readerTier'
import useUser from '@/app/hooks/useUser'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'

const metal = (t: ReaderTier) => `linear-gradient(135deg, ${t.light}, ${t.colour} 45%, ${t.shade})`

// Where the reader sits on the tier ladder, and what the next rung takes. The user menu's tier card links here.
const ReaderTierCard: FC = () => {
  const { user } = useUser()
  const booksReadFor = useBooksReadFor()
  if (!user) return null

  const booksRead = booksReadFor(user.username, booksReadOf(user))
  const { tier, next, remaining, progress } = tierProgress(booksRead)
  const barTier = next ?? tier

  return (
    <section id="tier" aria-labelledby="tier-heading" className="scroll-mt-24 mb-12 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div aria-hidden className={cn("relative h-12 w-12 shrink-0 rounded-xl overflow-hidden", !tier && "bg-neutral-200 dark:bg-neutral-800")}
          style={tier ? { background: metal(tier) } : undefined}>
          {tier?.shimmer && <div className={cn("tier-shimmer absolute inset-0", tier.key === "diamond" && "tier-shimmer-diamond")} />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="tier-heading" className="text-lg font-semibold">{tier ? `${tier.label} reader` : "Reading tier"}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {booksRead} {booksRead === 1 ? "book" : "books"} read
            {next ? ` · ${remaining} more to ${next.label}` : " · you've reached the top tier"}
          </p>
        </div>
      </div>

      {barTier && (
        <div className="mt-4 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden"
          role="progressbar" aria-label={next ? `Progress to ${next.label}` : "Top tier reached"}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(progress * 100, 3)}%`, background: `linear-gradient(90deg, ${barTier.colour}, ${barTier.shade})` }} />
        </div>
      )}

      <ol className="mt-6 grid grid-cols-5 gap-2">
        {READER_TIERS.map((t) => {
          const reached = booksRead >= t.minBooks
          const current = t.key === tier?.key
          return (
            <li key={t.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={current ? "step" : undefined}>
              <div className={cn("relative grid h-8 w-8 place-items-center rounded-lg transition", !reached && "opacity-35 saturate-50",
                current && "ring-2 ring-offset-2 ring-offset-background ring-neutral-400 dark:ring-neutral-500")}
                style={{ background: metal(t) }}>
                {reached && <Check size={14} strokeWidth={3} className="text-black/60" aria-hidden />}
              </div>
              <span className={cn("text-xs font-medium", !reached && "text-muted-foreground")}>{t.label}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">{t.minBooks}<span className="max-sm:sr-only"> books</span></span>
              <span className="sr-only">{reached ? "reached" : "not reached yet"}</span>
            </li>
          )
        })}
      </ol>

      <p className="mt-5 text-sm text-muted-foreground">
        Your tier frames your avatar on your profile and wherever your name appears. Each tier lands with a Books read milestone, and Gold and above shimmer.
      </p>
    </section>
  )
}

export default ReaderTierCard
