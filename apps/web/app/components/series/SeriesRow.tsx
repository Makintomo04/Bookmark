"use client"
import { FC, ReactNode, useEffect, useRef } from 'react'

// The row of a series' books, opened at the page's own book (the one marked aria-current) so book 7 of a
// long series isn't off the edge on a phone. Only the row scrolls, never the page.
const SeriesRow: FC<{ label: string, children: ReactNode }> = ({ label, children }) => {
  const row = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const list = row.current
    const here = list?.querySelector<HTMLElement>('[aria-current]')
    if (!list || !here) return
    const padding = parseFloat(getComputedStyle(list).paddingLeft) || 0
    list.scrollLeft = Math.max(0, here.offsetLeft - list.offsetLeft - padding)
  }, [])
  return (
    <ol ref={row} aria-label={label} className="-mx-4 px-4 scroll-px-4 flex gap-4 overflow-x-auto snap-x pt-1 pb-2">
      {children}
    </ol>
  )
}

export default SeriesRow
