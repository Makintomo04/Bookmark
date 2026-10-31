"use client"
import { ReactNode, useEffect, useRef, useState } from 'react'

const PAGE = 60

interface GrowingListProps<T> {
  items: T[]
  render: (item: T) => ReactNode
  className?: string
  // Starts again from the first page when this changes (a new search or sort).
  resetKey?: string
  page?: number
  // How many there are when `items` is only the first of them (someone else's shelf, before the rest has
  // loaded). Reaching the end of `items` then asks for the rest, and the list carries on once they arrive.
  total?: number
  onMore?: () => void
}

// Draws a long list a page at a time and adds the next page as the reader nears the end, so a shelf of
// 2,000 covers doesn't put 2,000 cards (and their images) on the page at once.
function GrowingList<T>({ items, render, className, resetKey, page = PAGE, total = items.length, onMore }: GrowingListProps<T>) {
  const [shown, setShown] = useState(page)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => { setShown(page) }, [resetKey, page])

  const more = shown < Math.max(total, items.length)
  // The next page, or the rest of the list when what's here has all been drawn.
  const next = () => (shown < items.length ? setShown((n) => n + page) : onMore?.())
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) next()
    }, { rootMargin: "800px 0px" })
    observer.observe(el)
    return () => observer.disconnect()
  }, [more, page, shown, items.length, onMore])

  return (
    <>
      <div className={className}>{items.slice(0, shown).map(render)}</div>
      {more && (
        <div ref={sentinel} className="mt-8 flex justify-center">
          {/* For keyboard and screen-reader users, and in case the observer never fires. */}
          <button type="button" onClick={next} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Show more ({(Math.max(total, items.length) - Math.min(shown, items.length)).toLocaleString('en-GB')} left)
          </button>
        </div>
      )}
    </>
  )
}

export default GrowingList
