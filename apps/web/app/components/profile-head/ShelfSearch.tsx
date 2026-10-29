"use client"
import { FC, useEffect, useRef } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSharedShelfFilter } from '@/app/hooks/useShelfFilter'

const iconButton = "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

// Searching your shelf from the top of your profile in bands, so a big library is one keystroke away ("/").
// From sm up it's the field itself, with Filter beside it; the results open under the top of the page
// (BookGrid's results slot). On a phone the field lives in the shelves' tab row, which sticks as you scroll,
// and this is a magnifier that takes you there.
const ShelfSearch: FC = () => {
  const shared = useSharedShelfFilter()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (!input.current || input.current.offsetParent === null) return
      e.preventDefault()
      input.current.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!shared) return null
  const { filter, setFilter, filtersOpen, setFiltersOpen } = shared
  // Opens the search in the shelves' sticky row, further down, and takes you there.
  const toPhoneSearch = () => {
    const toggle = document.getElementById('shelf-search-toggle')
    toggle?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (toggle?.getAttribute('aria-expanded') !== 'true') toggle?.click()
  }

  return (
    <>
      <div className="hidden sm:flex items-center gap-1">
        <label className="relative w-64">
          <span className="sr-only">Search your shelf</span>
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input ref={input} type="search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Search your shelf"
            onKeyDown={(e) => { if (e.key === 'Escape') { setFilter({ ...filter, q: '' }); setFiltersOpen(false); input.current?.blur() } }}
            className="h-9 w-full rounded-full border border-neutral-300 dark:border-neutral-700 bg-background pl-9 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          {!filter.q && <kbd aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-neutral-300 dark:border-neutral-700 px-1.5 text-[11px] text-muted-foreground">/</kbd>}
        </label>
        <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen} aria-label="Filter your shelf"
          className={cn(iconButton, filtersOpen && "bg-neutral-100 text-foreground dark:bg-neutral-900")}>
          <SlidersHorizontal size={16} aria-hidden />
        </button>
      </div>
      <button type="button" onClick={toPhoneSearch} aria-label="Search your shelf" className={cn(iconButton, "sm:hidden")}>
        <Search size={17} aria-hidden />
      </button>
    </>
  )
}

export default ShelfSearch
