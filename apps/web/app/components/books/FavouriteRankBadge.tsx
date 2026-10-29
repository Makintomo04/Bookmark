import { FC } from 'react'
import { cn } from '@/lib/utils'

// The 1 to 4 on a top-four favourite's cover, as on the lists' numbered rows: a small round number laid over the
// cover's corner. The parent is `relative`.
const FavouriteRankBadge: FC<{ rank: number; className?: string }> = ({ rank, className }) => (
  <span aria-label={`Number ${rank} favourite`}
    className={cn("pointer-events-none absolute left-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-background text-xs font-bold tabular-nums text-foreground shadow ring-1 ring-black/10 dark:ring-white/15", className)}>
    {rank}
  </span>
)

export default FavouriteRankBadge
