"use client"
import { FC, ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Half a cover (2:3) down from the row's top padding, where the arrows sit, for each size of card the rows use:
// 64px wide (compact), 112px (a series), and 128px, 144px from sm (a book page's More by and Readers also liked).
const ARROW_TOP = { compact: "top-[52px]", default: "top-[88px]", large: "top-[100px] sm:top-[112px]" }

// A row of book covers to swipe through: a series' books, or a book page's More by and Readers also liked.
// It opens at the item marked aria-current, if any, so book 7 of a long series isn't off the edge on a phone.
// Only the row scrolls, never the page. No scrollbar: a phone swipes, and with a mouse, arrows over the edges
// page through it. The edge that hides more fades out.
const CoverCarousel: FC<{
  label: string
  children: ReactNode
  size?: keyof typeof ARROW_TOP
  // What the arrows say they show, e.g. "Earlier books in the series".
  previousLabel?: string
  nextLabel?: string
  ordered?: boolean
}> = ({ label, children, size = "default", previousLabel = "Previous books", nextLabel = "More books", ordered = true }) => {
  const row = useRef<HTMLOListElement & HTMLUListElement>(null)
  const compact = size === "compact"
  const List = ordered ? "ol" : "ul"
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
      <List ref={row} aria-label={label} onScroll={measure}
        className={cn("-mx-4 px-4 scroll-px-4 flex overflow-x-auto", compact ? "gap-3" : "gap-4", "snap-x pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", fade)}>
        {children}
      </List>
      {/* Mouse and trackpad only: touch swipes the row itself. Keyboard users tab through the books. */}
      {more.left && (
        <button type="button" aria-label={previousLabel} tabIndex={-1} onClick={() => page(-1)} className={cn(arrow, ARROW_TOP[size], "-left-3")}>
          <ChevronLeft size={18} aria-hidden />
        </button>
      )}
      {more.right && (
        <button type="button" aria-label={nextLabel} tabIndex={-1} onClick={() => page(1)} className={cn(arrow, ARROW_TOP[size], "-right-3")}>
          <ChevronRight size={18} aria-hidden />
        </button>
      )}
    </div>
  )
}

export default CoverCarousel
