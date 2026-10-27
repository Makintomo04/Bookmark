"use client"
import { FC, ReactNode, useMemo, useState } from 'react'
import { ArrowUpDown, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EMPTY_FILTER, FORMAT_LABEL, SHELF_SORTS, SORT_LABEL, filterOptions,
  type ShelfBook, type ShelfFilter, type ShelfSort,
} from '@/lib/shelfFilter'
import { ratingGlyphs } from '@bookmark/shared/rating'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const pillClass = "h-10 rounded-full px-4 text-sm font-medium bg-neutral-200 dark:bg-neutral-700/60 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition"

interface Option { value: string; label: string }

interface PillSelectProps {
  // The accessible name, e.g. "Sort" or "Genre".
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  icon?: ReactNode
  // A filter with something chosen reads as on; sort never does.
  active?: boolean
  size?: "md" | "sm"
}

// A select drawn as a pill with the app's own menu, so it follows the theme (a native select's list
// is the browser's) and its chevron has room.
const PillSelect: FC<PillSelectProps> = ({ label, value, options, onChange, icon, active = false, size = "sm" }) => {
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}: ${current?.label}`}
        className={cn(
          "inline-flex max-w-[14rem] items-center gap-2 rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:ring-2 data-[state=open]:ring-ring",
          size === "md" ? "h-10 pl-4 pr-3" : "h-9 pl-3.5 pr-2.5",
          active
            ? "bg-foreground text-background hover:opacity-90"
            : size === "md"
              ? "bg-neutral-200 dark:bg-neutral-700/60 hover:bg-neutral-300 dark:hover:bg-neutral-700"
              : "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800",
        )}
      >
        {icon}
        <span className="truncate">{current?.label}</span>
        <ChevronDown size={16} aria-hidden className="shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem] max-h-80 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
  const any = (label: string): Option => ({ value: "", label })

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
        <PillSelect
          label="Sort"
          size="md"
          icon={<ArrowUpDown size={15} aria-hidden className="shrink-0" />}
          value={filter.sort}
          options={SHELF_SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))}
          onChange={(v) => set({ sort: v as ShelfSort })}
        />
        <button type="button" aria-expanded={showFilters} onClick={() => setOpen((v) => !v)} className={cn(pillClass, "inline-flex items-center gap-2")}>
          <SlidersHorizontal size={15} aria-hidden />
          Filter{activeFilters > 0 && <span className="tabular-nums">· {activeFilters}</span>}
        </button>
        {actions}
      </div>

      {showFilters && (
        <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
          {options.years.length > 0 && (
            <PillSelect label="Year finished" active={!!filter.year} value={filter.year ? String(filter.year) : ""}
              options={[any("Any year"), ...options.years.map((y) => ({ value: String(y), label: `Finished in ${y}` }))]}
              onChange={(v) => set({ year: v ? Number(v) : null, month: null })} />
          )}
          {filter.year && (
            <PillSelect label="Month finished" active={!!filter.month} value={filter.month ? String(filter.month) : ""}
              options={[any("Any month"), ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))]}
              onChange={(v) => set({ month: v ? Number(v) : null })} />
          )}
          {options.genres.length > 0 && (
            <PillSelect label="Genre" active={!!filter.genre} value={filter.genre ?? ""}
              options={[any("Any genre"), ...options.genres.map((g) => ({ value: g, label: g }))]}
              onChange={(v) => set({ genre: v || null })} />
          )}
          {(options.ratings.length > 0 || options.unrated) && (
            <PillSelect label="Rating" active={filter.rating !== null} value={filter.rating === null ? "" : String(filter.rating)}
              options={[
                any("Any rating"),
                ...options.ratings.map((r) => ({ value: String(r), label: `${ratingGlyphs(r)} ${r === 1 ? "star" : "stars"}` })),
                ...(options.unrated ? [{ value: "unrated", label: "Not rated" }] : []),
              ]}
              onChange={(v) => set({ rating: v === "" ? null : v === "unrated" ? "unrated" : Number(v) })} />
          )}
          {options.formats.length > 0 && (
            <PillSelect label="Format" active={!!filter.format} value={filter.format ?? ""}
              options={[any("Any format"), ...options.formats.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))]}
              onChange={(v) => set({ format: (v || null) as ShelfFilter["format"] })} />
          )}
          {options.tags.length > 0 && (
            <PillSelect label="Tag" active={!!filter.tag} value={filter.tag ?? ""}
              options={[any("Any tag"), ...options.tags.map((t) => ({ value: t, label: t }))]}
              onChange={(v) => set({ tag: v || null })} />
          )}
          {/* Set from a link (stats' top authors): shown so it can be taken off. */}
          {filter.author && (
            <button type="button" onClick={() => set({ author: null })} aria-label={`Remove author filter: ${filter.author}`}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground text-background pl-3.5 pr-2.5 text-sm font-medium hover:opacity-90">
              {filter.author}<X size={15} aria-hidden className="opacity-70" />
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
