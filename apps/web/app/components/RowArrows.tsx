"use client"
import { FC } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScrollRow } from '@/app/hooks/useScrollRow'

const arrowClass = "absolute z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-background/90 text-foreground shadow-sm backdrop-blur transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:flex dark:border-neutral-800 dark:hover:bg-neutral-900"

// Small arrows over the ends of a sideways row (useScrollRow), with a mouse only: a touch screen swipes. Each shows
// only while there's more that way. The row's wrapper is `relative`; `top` puts them level with the covers.
// `inside` keeps them within the row's edges, for a row with other controls right beside it (the shelf tabs).
const RowArrows: FC<{ row: Pick<ScrollRow, 'canBack' | 'canForward' | 'step'>; label: string; top?: string; inside?: boolean }> = ({ row, label, top = "top-1/2", inside = false }) => (
  <>
    {row.canBack && (
      <button type="button" onClick={() => row.step(-1)} aria-label={`Scroll ${label} back`} className={cn(arrowClass, inside ? "left-0" : "-left-3", top)}>
        <ChevronLeft size={16} aria-hidden />
      </button>
    )}
    {row.canForward && (
      <button type="button" onClick={() => row.step(1)} aria-label={`Scroll ${label} on`} className={cn(arrowClass, inside ? "right-0" : "-right-3", top)}>
        <ChevronRight size={16} aria-hidden />
      </button>
    )}
  </>
)

export default RowArrows
