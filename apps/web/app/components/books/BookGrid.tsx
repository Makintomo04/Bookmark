"use client"
import { CSSProperties, FC, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Book } from '@prisma/client'
import { LayoutGrid, Grid3x3, Check, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import useUser from '@/app/hooks/useUser'
import useViewMode from '@/app/hooks/useViewMode'
import BookCoverCard from '../cards/BookCoverCard'
import CompactBookCard from '../cards/CompactBookCard'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { SHELF_PREVIEW, ShelfSection, coverGridClass, groupShelf, isRereading, readingGridCols } from './shelf'
import BulkBar from './BulkBar'
import ShelfToolbar, { pillClass } from './ShelfToolbar'
import GrowingList from './GrowingList'
import {
  EMPTY_FILTER, SHELF_TITLE, isNarrowed, matchesFilter, parseShelfParams, shelfOf, shelfParams, sortBooks,
  type ShelfFilter, type ShelfKey,
} from '@/lib/shelfFilter'

interface BookGridProps {
  books: Book[]
  // One ungrouped grid in the given order, for pages like Favourites that want everything at a glance.
  flat?: boolean
}

const BookGrid: FC<BookGridProps> = ({ books, flat = false }) => {
  const [mounted, setMounted] = useState(false)
  const { viewMode, setViewMode } = useViewMode()
  const { user } = useUser()
  const accent = user?.favColour ?? null
  // Select mode: cards become checkboxes and BulkBar acts on the picked ones. No cap here: BulkBar sends
  // big selections in batches.
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const togglePick = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const pickAll = (items: Book[]) => setPicked((prev) => {
    const next = new Set(prev)
    const all = items.every((b) => next.has(b.id))
    for (const b of items) all ? next.delete(b.id) : next.add(b.id)
    return next
  })
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()) }

  // Search, sort and filter live in the URL, so /stats and Ask the shelf can link to a filtered shelf and
  // the back button undoes a "See all". `written` is the last query this grid put there itself, so typing
  // a trailing space isn't trimmed away by the round trip.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlKey = searchParams?.toString() ?? ""
  const written = useRef<string | null>(null)
  const top = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<ShelfFilter>(() => flat ? EMPTY_FILTER : parseShelfParams(new URLSearchParams(urlKey)))
  useEffect(() => {
    if (flat || urlKey === written.current) return
    written.current = urlKey
    setFilter(parseShelfParams(new URLSearchParams(urlKey)))
  }, [urlKey, flat])
  useEffect(() => {
    if (flat) return
    const next = shelfParams(filter).toString()
    if (next === (written.current ?? urlKey)) return
    const timer = setTimeout(() => {
      written.current = next
      const path = pathname ?? '/'
      router.replace(next ? `${path}?${next}` : path, { scroll: false })
    }, 250)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, flat])

  const openShelf = (shelf: ShelfKey | null) => {
    setFilter({ ...EMPTY_FILTER, sort: filter.sort, shelf })
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeMode = mounted ? viewMode : 'comfortable'
  const grouped = useMemo(() => groupShelf(books), [books])
  const { reading, wantToRead, finished, paused, didNotFinish, notInterested } = grouped
  const narrowed = isNarrowed(filter)
  const matches = useMemo(
    () => (narrowed || filter.shelf ? sortBooks(books.filter((b) => matchesFilter(b, filter)), filter.sort) : []),
    [books, filter, narrowed],
  )
  const coverShelves = ([
    { key: "paused", items: paused },
    { key: "want", items: wantToRead },
    { key: "finished", items: finished },
    { key: "dnf", items: didNotFinish },
    { key: "notInterested", items: notInterested },
  ] as { key: ShelfKey; items: Book[] }[])
    .filter((s) => s.items.length > 0)
    .map((s) => ({ ...s, items: filter.sort === "recent" ? s.items : sortBooks(s.items, filter.sort) }))

  // In select mode a button over each card takes the click, so the card's own modal and menu stay shut.
  const pickable = (book: Book, card: JSX.Element) => !selecting ? card : (
    <div key={book.id} className="relative">
      {card}
      <button type="button" aria-pressed={picked.has(book.id)} aria-label={`Select ${book.title}`} onClick={() => togglePick(book.id)}
        style={accent && picked.has(book.id) ? { '--tw-ring-color': accent } as CSSProperties : undefined}
        className={cn("absolute inset-0 z-10 rounded-xl transition focus-visible:outline-none focus-visible:ring-2",
          picked.has(book.id) ? "ring-2 ring-foreground bg-foreground/10" : "hover:bg-foreground/5")}>
        <span aria-hidden className={cn("absolute top-2 left-2 h-5 w-5 rounded-md border-2 border-white shadow flex items-center justify-center",
          picked.has(book.id) ? "bg-foreground text-background" : "bg-black/30")}>
          {picked.has(book.id) && <Check size={14} />}
        </span>
      </button>
    </div>
  )

  // `showShelf` labels each card with its shelf, for search results that mix them.
  const card = (book: Book, showShelf = false) => {
    const inner = activeMode === 'comfortable'
      ? <BookCoverCard key={book.id} book={book} accentColour={accent} selecting={selecting} />
      : <CompactBookCard key={book.id} book={book} />
    const labelled = showShelf ? (
      <div key={book.id} className="flex flex-col">
        {inner}
        <p className={cn("text-xs text-muted-foreground", activeMode === 'comfortable' ? "mt-1" : "mt-1 ml-1")}>{SHELF_TITLE[shelfOf(book.status)]}</p>
      </div>
    ) : inner
    return pickable(book, labelled)
  }
  const gridClass = activeMode === 'comfortable' ? coverGridClass : "grid grid-cols-1 lg:grid-cols-2 gap-3"
  const shelf = (items: Book[], showShelf = false) => (
    <div className={gridClass}>{items.map((book) => card(book, showShelf))}</div>
  )
  const longShelf = (items: Book[], showShelf = false) => (
    <GrowingList items={items} render={(book) => card(book, showShelf)} className={gridClass} resetKey={`${shelfParams(filter)}|${activeMode}`} />
  )

  const selectAll = (items: Book[]) => {
    if (!selecting || items.length === 0) return null
    const all = items.every((b) => picked.has(b.id))
    return (
      <button type="button" onClick={() => pickAll(items)} className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground">
        {all ? "Deselect all" : `Select all ${items.length}`}
      </button>
    )
  }

  const viewToggle = (
    <div className="flex items-center gap-2">
    <button type="button" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))} className={pillClass}>
      {selecting ? "Done" : "Select"}
    </button>
    <div className="flex gap-1 bg-neutral-200 dark:bg-neutral-700/60 rounded-full p-1">
      <button type="button" aria-label="Comfortable view" aria-pressed={activeMode === 'comfortable'} onClick={() => setViewMode('comfortable')}
        className={cn("h-8 w-8 rounded-full flex items-center justify-center transition",
          activeMode === 'comfortable' && "bg-white dark:bg-neutral-900 shadow-sm")}>
        <LayoutGrid size={18} />
      </button>
      <button type="button" aria-label="Compact view" aria-pressed={activeMode === 'compact'} onClick={() => setViewMode('compact')}
        className={cn("h-8 w-8 rounded-full flex items-center justify-center transition",
          activeMode === 'compact' && "bg-white dark:bg-neutral-900 shadow-sm")}>
        <Grid3x3 size={18} />
      </button>
    </div>
    </div>
  )

  const bulkBar = selecting && (
    <BulkBar selected={books.filter((b) => picked.has(b.id))} onDone={() => setPicked(new Set())} onCancel={stopSelecting} />
  )

  if (flat) return (
    <div className="w-full">
      <ShelfSection id="shelf-all" title="All books" count={books.length} action={<div className="flex items-center gap-3">{selectAll(books)}{viewToggle}</div>}>
        {longShelf(books)}
      </ShelfSection>
      {bulkBar}
    </div>
  )

  const toolbar = <ShelfToolbar books={books} filter={filter} onChange={setFilter} actions={viewToggle} />

  // A search or filter: one list of matches from every shelf (or the one shelf open), each labelled.
  if (narrowed || filter.shelf) {
    const title = narrowed
      ? `${matches.length === 1 ? "1 book matches" : `${matches.length.toLocaleString('en-GB')} books match`}${filter.shelf ? ` on ${SHELF_TITLE[filter.shelf]}` : ""}`
      : SHELF_TITLE[filter.shelf!]
    return (
      <div ref={top} className="w-full scroll-mt-24">
        {toolbar}
        <section aria-labelledby="shelf-results">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 min-h-10">
            <h2 id="shelf-results" className="flex items-baseline gap-2 text-lg font-semibold">
              {filter.shelf && (
                <button type="button" onClick={() => openShelf(null)} aria-label="Back to every shelf" className="self-center -ml-1 rounded-full p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800">
                  <ArrowLeft size={18} aria-hidden />
                </button>
              )}
              {title}
              {!narrowed && <span className="text-sm font-normal text-muted-foreground tabular-nums">{matches.length.toLocaleString('en-GB')}</span>}
            </h2>
            {selectAll(matches)}
          </div>
          {matches.length > 0
            ? longShelf(matches, !filter.shelf)
            : <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3 text-sm text-muted-foreground">
                Nothing on your shelf matches that. Try fewer words, or clear the filters.
              </p>}
        </section>
        {bulkBar}
      </div>
    )
  }

  return (
    <div ref={top} className="w-full scroll-mt-24">
      {toolbar}
      <ShelfSection id="shelf-reading" title="Currently reading" count={reading.length}>
        {reading.length > 0 ? (
          <div className={cn("grid grid-cols-1 gap-4", readingGridCols(reading.length))}>
            {reading.map((book) => <CurrentlyReadingCard key={book.id} book={book} accentColour={accent} isReread={isRereading(book, finished)} />)}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3 text-sm text-muted-foreground">
            You&apos;re not reading anything right now. {paused.length > 0
              ? `Resume a paused book${wantToRead.length > 0 ? ", or pick something from Want to read" : ""}.`
              : wantToRead.length > 0
                ? "Pick something from Want to read and mark it as started."
                : "Add the book you're reading now, or find your next one on Discover."}
          </p>
        )}
      </ShelfSection>

      {/* Empty shelves are hidden. Long ones show a preview; "See all" opens the whole shelf on its own. */}
      {coverShelves.map(({ key, items }) => (
        <ShelfSection key={key} id={`shelf-${key}`} title={SHELF_TITLE[key]} count={items.length} action={selectAll(items)}>
          {shelf(items.slice(0, SHELF_PREVIEW))}
          {items.length > SHELF_PREVIEW && (
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={() => openShelf(key)} className={pillClass}>
                See all {items.length.toLocaleString('en-GB')}
              </button>
            </div>
          )}
        </ShelfSection>
      ))}
      {bulkBar}
    </div>
  )
}

export default BookGrid
