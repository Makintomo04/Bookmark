"use client"
import { FC, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Book } from '@prisma/client'
import { ArrowUpDown, LayoutGrid, Grid3x3, ListChecks, Search, SlidersHorizontal, X } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { cn } from '@/lib/utils'
import useUser from '@/app/hooks/useUser'
import useViewMode from '@/app/hooks/useViewMode'
import useShelfPreview from '@/app/hooks/useShelfPreview'
import useCollapsedSections from '@/app/hooks/useCollapsedSections'
import BookCoverCard from '../cards/BookCoverCard'
import CompactBookCard from '../cards/CompactBookCard'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { SeeAllLink, ShelfSection, coverOnlyGridClass, groupShelf, isRereading, readingGridCols } from './shelf'
import BulkBar from './BulkBar'
import { useShelfFilterState, useSharedShelfFilter } from '@/app/hooks/useShelfFilter'
import ShelfToolbar, { PillSelect, pillClass } from './ShelfToolbar'
import GrowingList from './GrowingList'
import {
  EMPTY_FILTER, SHELF_SORTS, SHELF_TITLE, SORT_LABEL, isNarrowed, matchesFilter, shelfOf, shelfPageHref, shelfParams, sortBooks,
  type ShelfKey, type ShelfSort,
} from '@/lib/shelfFilter'

// Compact rows are short: six of them preview a shelf in about the height of two rows of covers.
const SHELF_ROWS_COMPACT = 6

interface BookGridProps {
  books: Book[]
  // One ungrouped grid in the given order, for pages like Favourites that want everything at a glance.
  flat?: boolean
  // A shelf's own page (/u/<username>/shelf/<slug>): that shelf only, searched, sorted and filtered.
  shelf?: ShelfKey
  // Your profile in bands, where the search sits at the top of the page (ShelfSearch) and
  // the filter is shared (ShelfFilterProvider). "results" is the panel under the top of the page while you
  // search or filter, and nothing otherwise; "shelves" is the shelves as tabs, further down.
  slot?: 'results' | 'shelves'
}

// The shelves' tabs in bands, in this order; empty ones are left out. "all" is every book.
const TABS: (ShelfKey | 'all')[] = ['want', 'reading', 'finished', 'paused', 'dnf', 'notInterested', 'all']
// The tab you last opened, so a big library lands where you left it.
const TAB_KEY = 'bookmark:shelf-tab'

const BookGrid: FC<BookGridProps> = ({ books, flat = false, shelf: onlyShelf, slot }) => {
  const [mounted, setMounted] = useState(false)
  // Two rows of covers on this screen, for each shelf's preview.
  const preview = useShelfPreview()
  const { viewMode, setViewMode } = useViewMode()
  const { user } = useUser()
  const accent = user?.favColour ?? null
  // On your profile each shelf folds up and stays that way. A shelf's own page (and the flat grid) is
  // one shelf, which stays open.
  const collapse = useCollapsedSections()
  const folding = (key: ShelfKey) => (flat || onlyShelf ? {} : collapse(`shelf-${key}`))
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

  // Search, sort and filter live in the URL (useShelfFilterState). In bands the page keeps one filter
  // for every part of the shelf, so this grid uses that instead of its own.
  const shared = useSharedShelfFilter()
  const own = useShelfFilterState({ flat, onlyShelf, enabled: !shared })
  const { filter, setFilter } = shared ?? own
  const top = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<ShelfKey | 'all' | null>(null)
  const [phoneSearch, setPhoneSearch] = useState(false)
  // The shelves' tab row scrolls on a phone: keep the open tab in view, clear of the fade at its edge.
  const tablist = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = tablist.current
    const active = row?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!row || !active) return
    const fade = 32
    if (active.offsetLeft + active.offsetWidth > row.scrollLeft + row.clientWidth - fade) row.scrollLeft = active.offsetLeft + active.offsetWidth - row.clientWidth + fade
    else if (active.offsetLeft < row.scrollLeft + fade) row.scrollLeft = Math.max(0, active.offsetLeft - fade)
  }, [tab, books.length, phoneSearch])
  useEffect(() => {
    if (slot !== 'shelves') return
    try { setTab(localStorage.getItem(TAB_KEY) as ShelfKey | 'all' | null) } catch {}
  }, [slot])
  const chooseTab = (key: ShelfKey | 'all') => {
    setTab(key)
    try { localStorage.setItem(TAB_KEY, key) } catch {}
  }

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
      return pickable(book, <BookCoverCard key={book.id} book={book} accentColour={accent} selected={selecting ? picked.has(book.id) : null} shelfLabel={label} coversOnly />)
    }
    return pickable(book, <CompactBookCard key={book.id} book={book} accentColour={accent} selected={selecting ? picked.has(book.id) : null} shelfLabel={label} />)
  }
  const gridClass = activeMode === 'comfortable' ? coverOnlyGridClass : "grid grid-cols-1 lg:grid-cols-2 gap-3"
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

  // What a search or filter found: one list from every shelf, each card labelled with its shelf.
  // Headed with what you searched for and a way out, and (from sm up) stuck to the top while you scroll them.
  const matchCount = matches.length.toLocaleString('en-GB')
  const query = filter.q.trim()
  const resultsTitle = `${matches.length === 1 ? "1 book matches" : `${matchCount} books match`}${query ? ` ‘${query}’` : ""}`
  const clearSearch = () => {
    setFilter({ ...EMPTY_FILTER, sort: filter.sort, shelf: filter.shelf })
    shared?.setFiltersOpen(false)
  }
  const results = (
    <section aria-labelledby="shelf-results">
      <div className="z-10 mb-5 flex min-h-10 flex-wrap items-center justify-between gap-4 bg-background sm:sticky sm:top-0 sm:py-2">
        <h2 id="shelf-results" className="text-lg font-semibold tabular-nums">{resultsTitle}</h2>
        <div className="flex items-center gap-4">
          {selectAll(matches)}
          <button type="button" onClick={clearSearch} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <X size={15} aria-hidden />Clear search
          </button>
        </div>
      </div>
      {matches.length > 0
        ? longShelf(matches, true)
        : <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3 text-sm text-muted-foreground">
            Nothing on your shelf matches that. Try fewer words, or clear the filters.
          </p>}
    </section>
  )

  // In bands, in place of what you're reading, right under the search: sort and filters, and what they found. From sm up only; on a phone
  // the search is in the shelves' tab row and its results open there.
  if (slot === 'results') {
    if (!narrowed && !shared?.filtersOpen) return null
    return (
      <div ref={top} className="hidden sm:block scroll-mt-24">
        {/* Sort, select and the filters stay behind the filter icon, so the results start right under the field. */}
        {shared?.filtersOpen && <ShelfToolbar books={books} filter={filter} onChange={setFilter} actions={viewToggle} searchless />}
        {narrowed && results}
        {bulkBar}
      </div>
    )
  }

  // In bands, further down: the shelves as tabs, opening on the one you last used. From sm up the tab row holds
  // sort and the view. On a phone it's one row that sticks to the top as the shelf scrolls: search (which opens
  // over the tabs), the tabs (scrolling, faded at the edge), and one menu for sort, view, filters and select.
  // Covers are three across on a phone, so a big library doesn't scroll forever.
  if (slot === 'shelves') {
    const byTab: Record<ShelfKey | 'all', Book[]> = {
      want: wantToRead, reading, finished, paused, dnf: didNotFinish, notInterested, all: books,
    }
    const tabs = TABS.filter((key) => byTab[key].length > 0)
    if (tabs.length === 0) return null
    const current = tab && tabs.includes(tab) ? tab : tabs[0]
    const items = filter.sort === "recent" && current !== 'all' ? byTab[current] : sortBooks(byTab[current], filter.sort)
    const iconButton = "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    const phoneGrid = activeMode === 'comfortable' ? "max-sm:grid-cols-3 max-sm:gap-x-3 max-sm:gap-y-6" : undefined
    const togglePhoneSearch = () => {
      if (phoneSearch) setFilter({ ...filter, q: '' })
      setPhoneSearch(!phoneSearch)
    }
    return (
      <section aria-label="Your shelves" className="w-full">
        <div className="z-20 mb-6 flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800 bg-background pb-2 max-sm:sticky max-sm:top-0 max-sm:-mx-4 max-sm:px-2 max-sm:pt-2 sm:gap-3 sm:pb-3">
          {phoneSearch && (
            <label className="relative flex-1 sm:hidden">
              <span className="sr-only">Search your shelf</span>
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus type="search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Search your shelf"
                className="h-10 w-full rounded-full border border-neutral-300 dark:border-neutral-700 bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
          )}
          <button id="shelf-search-toggle" type="button" onClick={togglePhoneSearch} aria-expanded={phoneSearch}
            aria-label={phoneSearch ? "Close search" : "Search your shelf"} className={cn(iconButton, "sm:hidden")}>
            {phoneSearch ? <X size={18} aria-hidden /> : <Search size={18} aria-hidden />}
          </button>
          <div ref={tablist} role="tablist" aria-label="Shelves"
            className={cn("relative flex min-w-0 flex-1 gap-1 overflow-x-auto max-sm:px-5 max-sm:[mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-24px),transparent)]", phoneSearch && "max-sm:hidden")}>
            {tabs.map((key) => (
              <button key={key} type="button" role="tab" aria-selected={key === current} onClick={() => chooseTab(key)}
                className={cn(
                  "h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  key === current ? "bg-neutral-200 text-foreground dark:bg-neutral-800" : "text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900",
                )}>
                {key === 'all' ? "All" : key === 'reading' ? "Reading" : SHELF_TITLE[key]} <span className="tabular-nums opacity-70">{byTab[key].length.toLocaleString('en-GB')}</span>
              </button>
            ))}
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <PillSelect label="Sort" icon={<ArrowUpDown size={15} aria-hidden className="shrink-0" />} value={filter.sort}
              options={SHELF_SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))} onChange={(v) => setFilter({ ...filter, sort: v as ShelfSort })} />
            {viewToggle}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Sort, view and filter" className={cn(iconButton, "sm:hidden")}>
              <SlidersHorizontal size={18} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Sort</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={filter.sort} onValueChange={(v) => setFilter({ ...filter, sort: v as ShelfSort })}>
                {SHELF_SORTS.map((s) => <DropdownMenuRadioItem key={s} value={s}>{SORT_LABEL[s]}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">View</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={activeMode} onValueChange={(v) => setViewMode(v as 'comfortable' | 'compact')}>
                <DropdownMenuRadioItem value="comfortable">Covers</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">List</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => shared?.setFiltersOpen(true)}>Filter</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? "Done selecting" : "Select books"}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {shared?.filtersOpen && <div className="sm:hidden"><ShelfToolbar books={books} filter={filter} onChange={setFilter} searchless /></div>}
        {narrowed && <div className="sm:hidden">{results}</div>}
        <div className={narrowed ? "max-sm:hidden" : undefined}>
          {activeMode === 'comfortable'
            ? <GrowingList items={items} render={(book) => card(book)} className={cn(gridClass, phoneGrid)} resetKey={`${current}|${shelfParams(filter)}|${activeMode}`} />
            : longShelf(items)}
        </div>
        {bulkBar}
      </section>
    )
  }

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
        <section id="profile-shelf" aria-labelledby="shelf-results">
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
      <div id="profile-shelf">
      {/* With nothing on the go, the section only shows while the shelf is new (nothing finished yet): for a
          reader with a full shelf it would push the first cover below the fold. A new reader with a few books
          saved and none started is who the first-book picker is for, so it links there (BOO-52). */}
      {(reading.length > 0 || coverShelves.length === 0 || finished.length === 0) && <ShelfSection id="shelf-reading" title="Currently reading" count={reading.length} {...folding("reading")}>
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
            {' '}<Link href="/first-book" className="font-medium text-foreground underline-offset-4 hover:underline">Help me pick a book</Link>
          </p>
        )}
      </ShelfSection>}

      {/* Empty shelves are hidden. Long ones show a preview; "See all" opens the shelf's own page. */}
      {coverShelves.map(({ key, items }) => (
        <ShelfSection key={key} id={`shelf-${key}`} title={SHELF_TITLE[key]} count={items.length} {...folding(key)}
          action={selecting ? selectAll(items) : items.length > preview && seeAllHref(key) ? <SeeAllLink href={seeAllHref(key)!} /> : undefined}>
          {shelf(items.slice(0, activeMode === 'comfortable' ? preview : SHELF_ROWS_COMPACT))}
          {items.length > (activeMode === 'comfortable' ? preview : SHELF_ROWS_COMPACT) && (
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
