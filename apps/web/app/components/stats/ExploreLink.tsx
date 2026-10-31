import { FC } from 'react'
import Link from 'next/link'
import { ArrowRight, Crown, SlidersHorizontal } from 'lucide-react'

// The way into the stats explorer (BOO-82) from /stats. For a free reader it says it's Plus, and leads to
// the explorer's own upgrade prompt; nothing on /stats itself is ever behind it.
const ExploreLink: FC<{ isPlus: boolean }> = ({ isPlus }) => (
  <Link
    href="/stats/explore"
    className="mt-4 mb-8 flex items-center gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 transition hover:bg-neutral-50 dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-100 dark:bg-neutral-900 text-[color:var(--accent-text)]">
      <SlidersHorizontal size={16} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        Explore your stats
        {!isPlus && <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-text"><Crown size={11} aria-hidden /> Plus</span>}
      </span>
      <span className="block text-sm text-muted-foreground">Any dates, two periods side by side, filters, saved views and a CSV of any chart.</span>
    </span>
    <ArrowRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
  </Link>
)

export default ExploreLink
