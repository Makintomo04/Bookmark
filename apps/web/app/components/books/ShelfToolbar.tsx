"use client"
import { FC, ReactNode, useMemo, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EMPTY_FILTER, FORMAT_LABEL, SHELF_SORTS, SORT_LABEL, filterOptions,
  type ShelfBook, type ShelfFilter, type ShelfSort,
} from '@/lib/shelfFilter'
import { ratingGlyphs } from '@bookmark/shared/rating'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const pillClass = "h-10 rounded-full px-4 text-sm font-medium bg-neutral-200 dark:bg-neutral-700/60 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition"
const selectClass = "h-9 max-w-[12rem] rounded-full border border-neutral-300 dark:border-neutral-700 bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

interface ShelfToolbarProps {
  books: ShelfBook[]
  filter: ShelfFilter
  onChange: (filter: ShelfFilter) => void
  // Select and the view toggle, at the end of the row.
  actions?: ReactNode
}

// Above the shelf: find a book by title, author or tag, sort every shelf, and narrow by year finished,
// genre, rating, format or tag. Filters only offer what's on the shelf.
const ShelfToolbar: FC<ShelfToolbarProps> = ({ books, filter, onChange, actions }) => {
  const options = useMemo(() => filterOptions(books), [books])
  const set = (patch: Partial<ShelfFilter>) => onChange({ ...filter, ...patch })
  const activeFilters = [filter.year, filter.genre, filter.rating, filter.format, filter.tag, filter.author].filter((v) => v !== null).length
  const [open, setOpen] = useState(activeFilters > 0)
  const showFilters = open || activeFilters > 0

  return (
    <div className="mb-8 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <span className="sr-only">Search your shelf</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={filter.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search your shelf by title, author or tag"
            className="h-10 w-full rounded-full border border-neutral-300 dark:border-neutral-700 bg-background pl-10 pr-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only sm:not-sr-only text-muted-foreground">Sort</span>
          <select value={filter.sort} onChange={(e) => set({ sort: e.target.value as ShelfSort })} className={cn(selectClass, "h-10")}>
            {SHELF_SORTS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
          </select>
        </label>
        <button type="button" aria-expanded={showFilters} onClick={() => setOpen((v) => !v)} className={cn(pillClass, "inline-flex items-center gap-2")}>
          <SlidersHorizontal size={15} aria-hidden />
          Filter{activeFilters > 0 && <span className="tabular-nums">· {activeFilters}</span>}
        </button>
        {actions}
      </div>

      {showFilters && (
        <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
          {options.years.length > 0 && (
            <select aria-label="Year finished" value={filter.year ?? ""} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null, month: null })} className={selectClass}>
              <option value="">Any year</option>
              {options.years.map((y) => <option key={y} value={y}>Finished in {y}</option>)}
            </select>
          )}
          {filter.year && (
            <select aria-label="Month finished" value={filter.month ?? ""} onChange={(e) => set({ month: e.target.value ? Number(e.target.value) : null })} className={selectClass}>
              <option value="">Any month</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          {options.genres.length > 0 && (
            <select aria-label="Genre" value={filter.genre ?? ""} onChange={(e) => set({ genre: e.target.value || null })} className={selectClass}>
              <option value="">Any genre</option>
              {options.genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          {(options.ratings.length > 0 || options.unrated) && (
            <select
              aria-label="Rating"
              value={filter.rating ?? ""}
              onChange={(e) => set({ rating: e.target.value === "" ? null : e.target.value === "unrated" ? "unrated" : Number(e.target.value) })}
              className={selectClass}
            >
              <option value="">Any rating</option>
              {options.ratings.map((r) => <option key={r} value={r}>{ratingGlyphs(r)} {r === 1 ? "star" : "stars"}</option>)}
              {options.unrated && <option value="unrated">Not rated</option>}
            </select>
          )}
          {options.formats.length > 0 && (
            <select aria-label="Format" value={filter.format ?? ""} onChange={(e) => set({ format: (e.target.value || null) as ShelfFilter["format"] })} className={selectClass}>
              <option value="">Any format</option>
              {options.formats.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
            </select>
          )}
          {options.tags.length > 0 && (
            <select aria-label="Tag" value={filter.tag ?? ""} onChange={(e) => set({ tag: e.target.value || null })} className={selectClass}>
              <option value="">Any tag</option>
              {options.tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {/* Set from a link (stats' top authors): shown so it can be taken off. */}
          {filter.author && (
            <button type="button" onClick={() => set({ author: null })} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700/60 px-3 text-sm">
              {filter.author}<X size={14} aria-label="Remove author filter" />
            </button>
          )}
          {(activeFilters > 0 || filter.q || filter.shelf) && (
            <button type="button" onClick={() => onChange({ ...EMPTY_FILTER, sort: filter.sort })} className="h-9 px-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Clear{filter.shelf ? ` and show every shelf` : " filters"}
            </button>
          )}
          {options.years.length === 0 && options.genres.length === 0 && options.formats.length === 0 && options.tags.length === 0 && options.ratings.length === 0 && (
            <p className="text-sm text-muted-foreground">Finish, rate or tag a few books and you can filter by them here.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default ShelfToolbar
