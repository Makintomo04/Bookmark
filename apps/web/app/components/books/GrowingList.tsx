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
}

// Draws a long list a page at a time and adds the next page as the reader nears the end, so a shelf of
// 2,000 covers doesn't put 2,000 cards (and their images) on the page at once.
function GrowingList<T>({ items, render, className, resetKey, page = PAGE }: GrowingListProps<T>) {
  const [shown, setShown] = useState(page)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => { setShown(page) }, [resetKey, page])

  const more = shown < items.length
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => n + page)
    }, { rootMargin: "800px 0px" })
    observer.observe(el)
    return () => observer.disconnect()
  }, [more, page, shown])

  return (
    <>
      <div className={className}>{items.slice(0, shown).map(render)}</div>
      {more && (
        <div ref={sentinel} className="mt-8 flex justify-center">
          {/* For keyboard and screen-reader users, and in case the observer never fires. */}
          <button type="button" onClick={() => setShown((n) => n + page)} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Show more ({items.length - shown} left)
          </button>
        </div>
      )}
    </>
  )
}

export default GrowingList
