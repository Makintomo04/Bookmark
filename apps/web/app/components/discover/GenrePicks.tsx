"use client"
import { FC, PointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, EyeOff, SlidersHorizontal } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { joinLabels } from '@/lib/genres'
import { cn } from '@/lib/utils'
import type { GenrePicks as Picks } from '@/lib/genrePicks'
import DiscoverBookCard from './DiscoverBookCard'

const arrowClass = "grid size-8 place-items-center rounded-full border border-neutral-300 dark:border-neutral-700 transition hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const changeClass = "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium border border-neutral-300 dark:border-neutral-700 transition hover:bg-neutral-100 dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
// How far a mouse has to travel before a press becomes a drag, so a slightly shaky click still clicks.
const DRAG_THRESHOLD = 5

// The genre picks: popular books from the genres the reader picked in onboarding or Settings, in one row
// that scrolls sideways (and drags with a mouse), covers sized like the shelf's (books/shelf.tsx
// coverGridClass), with arrows for the rest. Shows nothing until it has books, so a reader without
// favourite genres never sees an empty box.
// On a new shelf it's a welcome ("Somewhere to start"); on Discover, one section among the others.
// `onHide` adds "Hide these suggestions" under the row (the shelf passes it; Discover doesn't).
const GenrePicks: FC<{ placement: 'shelf' | 'discover', className?: string, onHide?: () => void }> = ({ placement, className, onHide }) => {
  const { data } = useSWR<Picks>('/api/discover/for-you', fetcher, swrOptions)
  const rowRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  const drag = useRef<{ x: number, left: number, moved: boolean } | null>(null)
  const swallowClick = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const measure = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    setEdges({ start: row.scrollLeft <= 1, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 })
  }, [])
  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, data])

  if (!data || data.books.length === 0) return null
  // A page at a time, less a sliver so the last cover seen stays in view.
  const page = (direction: 1 | -1) => rowRef.current?.scrollBy({ left: direction * rowRef.current.clientWidth * 0.9, behavior: 'smooth' })

  // Mouse dragging; touch and trackpads already scroll the row natively. Snapping is off mid-drag so the
  // row follows the pointer, then it settles on the nearest cover.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !rowRef.current) return
    drag.current = { x: e.clientX, left: rowRef.current.scrollLeft, moved: false }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const row = rowRef.current
    const d = drag.current
    if (!row || !d) return
    const dx = e.clientX - d.x
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      d.moved = true
      setIsDragging(true)
      row.setPointerCapture(e.pointerId)
    }
    row.scrollLeft = d.left - dx
  }
  const endDrag = () => {
    const row = rowRef.current
    const moved = drag.current?.moved
    drag.current = null
    if (!row || !moved) return
    // The click that ends a drag isn't a click on whichever cover it let go over.
    swallowClick.current = true
    setIsDragging(false)
    const slots = Array.from(row.children) as HTMLElement[]
    const nearest = slots.reduce((best, slot) =>
      Math.abs(slot.offsetLeft - row.offsetLeft - row.scrollLeft) < Math.abs(best.offsetLeft - row.offsetLeft - row.scrollLeft) ? slot : best, slots[0])
    requestAnimationFrame(() => row.scrollTo({ left: nearest.offsetLeft - row.offsetLeft, behavior: 'smooth' }))
  }

  return (
    <section aria-labelledby="genre-picks-heading" className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id="genre-picks-heading" className="text-xl font-bold">{placement === 'shelf' ? 'Somewhere to start' : 'From the genres you picked'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {placement === 'shelf' ? 'Popular with readers who love' : 'What readers shelve most in'} {joinLabels(data.genres.map((g) => g.label))}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/settings#genres" className={changeClass}>
            <SlidersHorizontal size={14} aria-hidden />Change genres
          </Link>
          <div className="hidden sm:flex gap-2">
            <button type="button" onClick={() => page(-1)} disabled={edges.start} aria-label="Previous books" className={arrowClass}><ChevronLeft size={16} aria-hidden /></button>
            <button type="button" onClick={() => page(1)} disabled={edges.end} aria-label="More books" className={arrowClass}><ChevronRight size={16} aria-hidden /></button>
          </div>
        </div>
      </div>
      <div
        ref={rowRef}
        onScroll={measure}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (!swallowClick.current) return
          swallowClick.current = false
          e.preventDefault()
          e.stopPropagation()
        }}
        // Covers are images; without this the browser starts dragging the picture instead of the row.
        onDragStart={(e) => e.preventDefault()}
        className={cn(
          "mt-4 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-x-5 overflow-x-auto scroll-px-4 sm:scroll-px-0 pb-2 sm:cursor-grab [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          isDragging ? "cursor-grabbing select-none sm:cursor-grabbing" : "snap-x snap-mandatory"
        )}
      >
        {data.books.map((book, i) => (
          <div
            key={book.workKey ?? i}
            className={cn(
              // The card fills its slot's width, so every cover is the same size whatever its title, and its
              // height (flex stretch), so the buttons line up across the row.
              "flex shrink-0 snap-start [&>*]:w-full",
              // Two and a bit on phones, so the row shows it scrolls; then the shelf's 3/4/5/6 columns.
              "basis-[42%] sm:basis-[calc((100%-2*1.25rem)/3)] md:basis-[calc((100%-3*1.25rem)/4)] lg:basis-[calc((100%-4*1.25rem)/5)] xl:basis-[calc((100%-5*1.25rem)/6)]"
            )}
          >
            <DiscoverBookCard book={book} />
          </div>
        ))}
      </div>
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <EyeOff size={14} aria-hidden />Hide these suggestions
        </button>
      )}
    </section>
  )
}

export default GenrePicks
