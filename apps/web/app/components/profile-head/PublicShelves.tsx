"use client"
import { FC, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Grid3x3, LayoutGrid } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { EMPTY_FILTER, SHELF_TITLE, isNarrowed, matchesFilter, shelfParams, sortBooks, type ShelfFilter, type ShelfKey } from '@/lib/shelfFilter'
import useViewMode from '@/app/hooks/useViewMode'
import BookCoverCard from '../cards/BookCoverCard'
import BookCover from '../cards/BookCover'
import AuthorLink from '../AuthorLink'
import StarRating from '../StarRating'
import GrowingList from '../books/GrowingList'
import BookDetailsButton from '../books/BookDetailsButton'
import ShelfToolbar from '../books/ShelfToolbar'
import { coverOnlyGridClass } from '../books/shelf'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { publicShelfKey } from '@/lib/profileKey'

interface PublicShelvesProps {
  username: string
  // The newest of each shelf, as their page carries them (profilePreview), and how many each holds.
  wantToRead: Book[]
  finished: Book[]
  counts: { want: number; finished: number }
  accentColour?: string | null
}

type Tab = Extract<ShelfKey, 'want' | 'finished'> | 'all'

// The tab they last opened, as on your own profile's shelves (BookGrid uses the same key).
const TAB_KEY = 'bookmark:shelf-tab'

// A book as a row, read-only: cover, title, author and their rating. Opens the book's details.
const CompactRow: FC<{ book: Book }> = ({ book }) => (
  <div className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
    <BookDetailsButton book={book} duplicate className="w-10 shrink-0 transition hover:opacity-90">
      <BookCover book={book} variant="thumb" sizes="40px" className="shadow-sm" />
    </BookDetailsButton>
    <div className="min-w-0 flex-1">
      <BookDetailsButton book={book} className="line-clamp-1 font-medium leading-snug hover:underline underline-offset-2">{book.title}</BookDetailsButton>
      <p className="truncate text-sm text-muted-foreground"><AuthorLink author={book.author} /></p>
    </div>
    {book.rating ? <StarRating value={book.rating} readOnly size={14} label="Rating" className="shrink-0" /> : null}
  </div>
)

// Someone else's shelves as tabs, as on your own profile (BookGrid's shelves slot): Want to read, Finished and
// All, with the same search, sort and filters, and covers or a list. Only the shelves their profile shows are
// here (lib/publicProfile.ts), so a shelf they keep to themselves, or an empty one, has no tab. Currently
// reading is above, in Reading now. The page carries the newest of each shelf; the rest (covers only, from
// /api/users/<them>?books=shelf) loads once the viewer searches, filters, sorts or scrolls past them.
const PublicShelves: FC<PublicShelvesProps> = ({ username, wantToRead: wantPreview, finished: finishedPreview, counts, accentColour }) => {
  const [tab, setTab] = useState<Tab | null>(null)
  const [filter, setFilter] = useState<ShelfFilter>(EMPTY_FILTER)
  const [wantAll, setWantAll] = useState(false)
  const partial = wantPreview.length < counts.want || finishedPreview.length < counts.finished
  const { data: full } = useSWR<{ books: Book[] }>(wantAll && partial ? publicShelfKey(username) : null, fetcher, swrOptions)
  const wantToRead = useMemo(() => full ? full.books.filter((b) => b.status === 'NOT_STARTED') : wantPreview, [full, wantPreview])
  const finished = useMemo(() => full ? full.books.filter((b) => b.status === 'COMPLETED') : finishedPreview, [full, finishedPreview])
  const loading = partial && !full
  const count: Record<Tab, number> = { want: counts.want, finished: counts.finished, all: counts.want + counts.finished }
  const { viewMode, setViewMode } = useViewMode()
  // The stored view and tab are read after mount, so the server's markup and the first render agree.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(TAB_KEY)
      if (saved === 'want' || saved === 'finished' || saved === 'all') setTab(saved)
    } catch {}
  }, [])
  const mode = mounted ? viewMode : 'comfortable'

  const byTab = useMemo(() => ({ want: wantToRead, finished, all: [...wantToRead, ...finished] }), [wantToRead, finished])
  // With one shelf, "All" is the same books again.
  const shown = (['want', 'finished', 'all'] as Tab[]).filter((key) => count[key] > 0 && (key !== 'all' || (counts.want > 0 && counts.finished > 0)))
  // With no tab saved, the shelf with the most books (never "All"); the first of them on a tie.
  const fullest = shown.filter((key) => key !== 'all').reduce<Tab | undefined>((best, key) => (!best || count[key] > count[best] ? key : best), undefined)
  const current = tab && shown.includes(tab) ? tab : fullest
  // Anything past the first screenful needs the whole shelf.
  const narrow = (next: ShelfFilter) => { setWantAll(true); setFilter(next) }
  const choose = (key: Tab) => {
    setTab(key)
    setWantAll(true)
    setFilter((f) => ({ ...f, shelf: key === 'all' ? null : key }))
    try { localStorage.setItem(TAB_KEY, key) } catch {}
  }
  // The filter's shelf follows the tab, including the one a saved tab opens on.
  const shelf: ShelfKey | null = current && current !== 'all' ? current : null
  const active = useMemo(() => ({ ...filter, shelf }), [filter, shelf])

  const matches = useMemo(() => (current ? sortBooks(byTab[current].filter((b) => matchesFilter(b, active)), active.sort) : []), [byTab, current, active])
  if (!current) return null
  const narrowed = isNarrowed(active)

  const viewToggle = (
    <div className="flex gap-1 rounded-full bg-neutral-200 p-1 dark:bg-neutral-700/60">
      {([['comfortable', 'Covers', LayoutGrid], ['compact', 'List', Grid3x3]] as const).map(([value, label, Icon]) => (
        <button key={value} type="button" aria-label={`${label} view`} aria-pressed={mode === value} onClick={() => setViewMode(value)}
          className={cn("flex size-8 items-center justify-center rounded-full transition", mode === value && "bg-white shadow-sm dark:bg-neutral-900")}>
          <Icon size={18} aria-hidden />
        </button>
      ))}
    </div>
  )

  return (
    <section aria-label="Shelves" className="w-full">
      <div role="tablist" aria-label="Shelves" className="mb-4 flex gap-1 overflow-x-auto border-b border-neutral-200 pb-2 dark:border-neutral-800">
        {shown.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={key === current} onClick={() => choose(key)}
            className={cn(
              "h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              key === current ? "bg-neutral-200 text-foreground dark:bg-neutral-800" : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-900",
            )}>
            {key === 'all' ? "All" : SHELF_TITLE[key]} <span className="tabular-nums opacity-70">{count[key].toLocaleString('en-GB')}</span>
          </button>
        ))}
      </div>
      <ShelfToolbar books={byTab[current]} filter={active} onChange={narrow} actions={viewToggle} />
      {narrowed && !loading && (
        <h2 className="mb-5 text-lg font-semibold tabular-nums">
          {matches.length === 1 ? "1 book matches" : `${matches.length.toLocaleString('en-GB')} books match`}
        </h2>
      )}
      {narrowed && loading
        ? <p className="text-sm text-muted-foreground" role="status">Looking through the whole shelf…</p>
        : (matches.length > 0 || loading)
        ? <GrowingList items={matches} total={loading ? count[current] : undefined} onMore={() => setWantAll(true)} className={mode === 'comfortable' ? coverOnlyGridClass : "grid grid-cols-1 gap-3 lg:grid-cols-2"} resetKey={`${current}|${shelfParams(active)}|${mode}`}
            render={(book) => mode === 'comfortable'
              ? <BookCoverCard key={book.id} book={book} accentColour={accentColour} readOnly coversOnly />
              : <CompactRow key={book.id} book={book} />} />
        : <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-sm text-muted-foreground dark:border-neutral-700">
            Nothing on this shelf matches that. Try fewer words, or clear the filters.
          </p>}
    </section>
  )
}

export default PublicShelves
