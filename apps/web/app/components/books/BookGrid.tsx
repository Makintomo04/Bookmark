"use client"
import { FC, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Book } from '@prisma/client'
import { LayoutGrid, Grid3x3, ListChecks, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import useUser from '@/app/hooks/useUser'
import useViewMode from '@/app/hooks/useViewMode'
import BookCoverCard from '../cards/BookCoverCard'
import CompactBookCard from '../cards/CompactBookCard'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { SHELF_PREVIEW, SeeAllLink, ShelfSection, coverGridClass, groupShelf, isRereading, readingGridCols } from './shelf'
import BulkBar from './BulkBar'
import ShelfToolbar, { pillClass } from './ShelfToolbar'
import GrowingList from './GrowingList'
import {
  EMPTY_FILTER, SHELF_TITLE, isNarrowed, matchesFilter, parseShelfParams, shelfOf, shelfPageHref, shelfParams, sortBooks,
  type ShelfFilter, type ShelfKey,
} from '@/lib/shelfFilter'

interface BookGridProps {
  books: Book[]
  // One ungrouped grid in the given order, for pages like Favourites that want everything at a glance.
  flat?: boolean
  // A shelf's own page (/u/<username>/shelf/<slug>): that shelf only, searched, sorted and filtered.
  shelf?: ShelfKey
}

const BookGrid: FC<BookGridProps> = ({ books, flat = false, shelf: onlyShelf }) => {
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

  // Search, sort and filter live in the URL, so /stats and Ask the shelf can link to a filtered shelf and a
  // reload keeps them. `written` is the last query this grid put there itself, so its own writes aren't read
  // back as a new link (which would trim a trailing space mid-typing).
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlKey = searchParams?.toString() ?? ""
  const written = useRef<string | null>(null)
  const top = useRef<HTMLDivElement>(null)
  // The shelf is the page's (onlyShelf) or none: one shelf at a time lives on its own page, not in a param.
  const fromUrl = (key: string): ShelfFilter => ({ ...parseShelfParams(new URLSearchParams(key)), shelf: onlyShelf ?? null })
  const [filter, setFilter] = useState<ShelfFilter>(() => flat ? EMPTY_FILTER : fromUrl(urlKey))
  useEffect(() => {
    if (flat || urlKey === written.current) return
    written.current = urlKey
    setFilter(fromUrl(urlKey))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey, flat])
  useEffect(() => {
    if (flat) return
    const next = shelfParams({ ...filter, shelf: null }).toString()
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
  }, [filter, flat])

  // "See all" opens the shelf's own page, keeping the sort: a real navigation, so Back returns here.
  const username = user?.username ?? null
  const seeAllHref = (key: ShelfKey) => (username ? shelfPageHref(username, key, { sort: filter.sort }) : null)

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
  // The cards draw their own check and ring (selected).
  const pickable = (book: Book, card: JSX.Element) => !selecting ? card : (
    <div key={book.id} className="relative">
      {card}
      <button type="button" aria-pressed={picked.has(book.id)} aria-label={`Select ${book.title}`} onClick={() => togglePick(book.id)}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background" />
    </div>
  )

  // `showShelf` labels each card with its shelf, for search results that mix them.
  const card = (book: Book, showShelf = false) => {
    const label = showShelf ? SHELF_TITLE[shelfOf(book.status)] : undefined
    if (activeMode === 'comfortable') {
      return pickable(book, <BookCoverCard key={book.id} book={book} accentColour={accent} selected={selecting ? picked.has(book.id) : null} shelfLabel={label} />)
    }
    return pickable(book, <CompactBookCard key={book.id} book={book} accentColour={accent} selected={selecting ? picked.has(book.id) : null} shelfLabel={label} />)
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
    <div className="flex items-center gap-1.5 sm:gap-2">
    {/* On a phone these are icons, so the toolbar fits on one row beside the search. */}
    <button type="button" aria-pressed={selecting} aria-label={selecting ? "Done selecting" : "Select books"} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
      className={cn(pillClass, "inline-flex items-center justify-center max-sm:w-10 max-sm:px-0")}>
      <span className="sm:hidden">{selecting ? <X size={17} aria-hidden /> : <ListChecks size={17} aria-hidden />}</span>
      <span className="hidden sm:inline">{selecting ? "Done" : "Select"}</span>
    </button>
    <button type="button" onClick={() => setViewMode(activeMode === 'comfortable' ? 'compact' : 'comfortable')}
      aria-label={activeMode === 'comfortable' ? "Switch to compact view" : "Switch to comfortable view"}
      className={cn(pillClass, "sm:hidden inline-flex w-10 items-center justify-center px-0")}>
      {activeMode === 'comfortable' ? <Grid3x3 size={17} aria-hidden /> : <LayoutGrid size={17} aria-hidden />}
    </button>
    <div className="hidden sm:flex gap-1 bg-neutral-200 dark:bg-neutral-700/60 rounded-full p-1">
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

  // On a shelf's page the filters only offer what's on that shelf.
  const toolbarBooks = onlyShelf ? books.filter((b) => shelfOf(b.status) === onlyShelf) : books
  const toolbar = <ShelfToolbar books={toolbarBooks} filter={filter} onChange={setFilter} actions={viewToggle} />

  // A search or filter: one list of matches from every shelf, each labelled. On a shelf's own page, that
  // shelf in full (the page's title names it).
  if (narrowed || filter.shelf) {
    const n = matches.length.toLocaleString('en-GB')
    const title = narrowed
      ? matches.length === 1 ? "1 book matches" : `${n} books match`
      : matches.length === 1 ? "1 book" : `${n} books`
    return (
      <div ref={top} className="w-full scroll-mt-24">
        {toolbar}
        <section aria-labelledby="shelf-results">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 min-h-10">
            <h2 id="shelf-results" className="text-lg font-semibold tabular-nums">{title}</h2>
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
      {/* Wrapped so the first shelf is a first child and skips ShelfSection's top margin. */}
      <div>
      {/* With nothing on the go, the section only shows while the shelf is new: for a reader with a full
          shelf it would push the first cover below the fold. */}
      {(reading.length > 0 || coverShelves.length === 0) && <ShelfSection id="shelf-reading" title="Currently reading" count={reading.length}>
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
      </ShelfSection>}

      {/* Empty shelves are hidden. Long ones show a preview; "See all" opens the shelf's own page. */}
      {coverShelves.map(({ key, items }) => (
        <ShelfSection key={key} id={`shelf-${key}`} title={SHELF_TITLE[key]} count={items.length}
          action={selecting ? selectAll(items) : items.length > SHELF_PREVIEW && seeAllHref(key) ? <SeeAllLink href={seeAllHref(key)!} /> : undefined}>
          {shelf(items.slice(0, SHELF_PREVIEW))}
          {items.length > SHELF_PREVIEW && (
            <div className="mt-6 flex justify-center">
              {seeAllHref(key) && (
                <Link href={seeAllHref(key)!} className={cn(pillClass, "inline-flex items-center")}>
                  See all {items.length.toLocaleString('en-GB')}
                </Link>
              )}
            </div>
          )}
        </ShelfSection>
      ))}
      </div>
      {bulkBar}
    </div>
  )
}

export default BookGrid
