"use client"
import { FC, ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Half a cover (112px wide, 2:3) down from the row's top padding: where the arrows sit.
const ARROW_TOP = "top-[88px]"

// The row of a series' books, opened at the page's own book (the one marked aria-current) so book 7 of a
// long series isn't off the edge on a phone. Only the row scrolls, never the page. No scrollbar: a phone
// swipes, and with a mouse, arrows over the edges page through it. The edge that hides more fades out.
const SeriesRow: FC<{ label: string, children: ReactNode }> = ({ label, children }) => {
  const row = useRef<HTMLOListElement>(null)
  const [more, setMore] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const list = row.current
    if (!list) return
    const left = list.scrollLeft > 4
    const right = list.scrollLeft + list.clientWidth < list.scrollWidth - 4
    setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    const list = row.current
    const here = list?.querySelector<HTMLElement>('[aria-current]')
    if (list && here) {
      const padding = parseFloat(getComputedStyle(list).paddingLeft) || 0
      list.scrollLeft = Math.max(0, here.offsetLeft - list.offsetLeft - padding)
    }
    measure()
    if (!list) return
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [measure])

  // A page is the visible width less one cover, so the last book in view stays as a landmark.
  const page = (direction: 1 | -1) => {
    const list = row.current
    if (!list) return
    list.scrollBy({ left: direction * Math.max(120, list.clientWidth - 128), behavior: 'smooth' })
  }

  const fade = more.left && more.right
    ? "[mask-image:linear-gradient(to_right,transparent,black_48px,black_calc(100%-48px),transparent)]"
    : more.right ? "[mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)]"
    : more.left ? "[mask-image:linear-gradient(to_right,transparent,black_48px)]"
    : ""

  const arrow = "absolute z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 shadow-md transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-neutral-800 [@media(hover:hover)]:flex"

  return (
    <div className="relative">
      <ol ref={row} aria-label={label} onScroll={measure}
        className={cn("-mx-4 px-4 scroll-px-4 flex gap-4 overflow-x-auto snap-x pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", fade)}>
        {children}
      </ol>
      {/* Mouse and trackpad only: touch swipes the row itself. Keyboard users tab through the books. */}
      {more.left && (
        <button type="button" aria-label="Earlier books in the series" tabIndex={-1} onClick={() => page(-1)} className={cn(arrow, ARROW_TOP, "-left-3")}>
          <ChevronLeft size={18} aria-hidden />
        </button>
      )}
      {more.right && (
        <button type="button" aria-label="Later books in the series" tabIndex={-1} onClick={() => page(1)} className={cn(arrow, ARROW_TOP, "-right-3")}>
          <ChevronRight size={18} aria-hidden />
        </button>
      )}
    </div>
  )
}

export default SeriesRow
