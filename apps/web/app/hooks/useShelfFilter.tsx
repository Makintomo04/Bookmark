"use client"
import { FC, ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { EMPTY_FILTER, parseShelfParams, shelfParams, type ShelfFilter, type ShelfKey } from '@/lib/shelfFilter'
import { LAYOUT_PARAM } from '../components/profile-head/Band'

interface Options {
  // One ungrouped grid with no search in the URL (Favourites).
  flat?: boolean
  // A shelf's own page: that shelf, always.
  onlyShelf?: ShelfKey
  // Off when a ShelfFilterProvider above already keeps the filter, so the URL has one writer.
  enabled?: boolean
}

// Search, sort and filter live in the URL, so /stats and Ask the shelf can link to a filtered shelf and a
// reload keeps them. `written` is the last query this hook put there itself, so its own writes aren't read
// back as a new link (which would trim a trailing space mid-typing).
export function useShelfFilterState({ flat = false, onlyShelf, enabled = true }: Options = {}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlKey = searchParams?.toString() ?? ""
  const written = useRef<string | null>(null)
  const live = enabled && !flat
  // The shelf is the page's (onlyShelf) or none: one shelf at a time lives on its own page, not in a param.
  const fromUrl = (key: string): ShelfFilter => ({ ...parseShelfParams(new URLSearchParams(key)), shelf: onlyShelf ?? null })
  const [filter, setFilter] = useState<ShelfFilter>(() => live ? fromUrl(urlKey) : EMPTY_FILTER)
  useEffect(() => {
    if (!live || urlKey === written.current) return
    written.current = urlKey
    setFilter(fromUrl(urlKey))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey, live])
  useEffect(() => {
    if (!live) return
    // The profile's layout trial rides along, so a search doesn't drop you back to the old layout on reload.
    const params = shelfParams({ ...filter, shelf: null })
    const layout = searchParams?.get(LAYOUT_PARAM)
    if (layout) params.set(LAYOUT_PARAM, layout)
    const next = params.toString()
    if (next === (written.current ?? urlKey)) return
    const timer = setTimeout(() => {
      written.current = next
      const path = pathname ?? '/'
      // In place, not router.replace: that refetches the whole profile from the server on every change,
      // and a slow one landing after a later change put the old filter back (picking "Any year" undone).
      // Next keeps useSearchParams in step with history.replaceState.
      window.history.replaceState(window.history.state, '', next ? `${path}?${next}` : path)
    }, 250)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, live])
  return { filter, setFilter }
}

interface SharedShelfFilter {
  filter: ShelfFilter
  setFilter: (filter: ShelfFilter) => void
  // The filter pills are open beside the search, though nothing is chosen yet.
  filtersOpen: boolean
  setFiltersOpen: (open: boolean) => void
}

const ShelfFilterContext = createContext<SharedShelfFilter | null>(null)

// One filter for a page that shows the shelf in more than one place: your profile in bands, where the search
// sits at the top, its results open under it, and the shelves come further down.
export const ShelfFilterProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { filter, setFilter } = useShelfFilterState()
  const [filtersOpen, setFiltersOpen] = useState(false)
  return <ShelfFilterContext.Provider value={{ filter, setFilter, filtersOpen, setFiltersOpen }}>{children}</ShelfFilterContext.Provider>
}

export const useSharedShelfFilter = () => useContext(ShelfFilterContext)
