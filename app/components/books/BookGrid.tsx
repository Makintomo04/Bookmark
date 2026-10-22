"use client"
import { CSSProperties, FC, useEffect, useState } from 'react'
import { Book } from '@prisma/client'
import { LayoutGrid, Grid3x3, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import useUser from '@/app/hooks/useUser'
import useViewMode from '@/app/hooks/useViewMode'
import { shelfAccent } from '@/lib/personalisation'
import BookCoverCard from '../cards/BookCoverCard'
import CompactBookCard from '../cards/CompactBookCard'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { ShelfSection, coverGridClass, groupShelf, isRereading, readingGridCols } from './shelf'
import BulkBar from './BulkBar'
import { BULK_MAX } from '@/lib/bulkRules'

interface BookGridProps {
  books: Book[]
  // One ungrouped grid in the given order, for pages like Favourites that want everything at a glance.
  flat?: boolean
}

const BookGrid: FC<BookGridProps> = ({ books, flat = false }) => {
  const [mounted, setMounted] = useState(false)
  const { viewMode, setViewMode } = useViewMode()
  const { user } = useUser()
  // The shelf card colour (Plus) when set, else the profile colour.
  const accent = user ? shelfAccent(user) : null
  // Select mode: cards become checkboxes and BulkBar acts on the picked ones.
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const togglePick = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else if (next.size < BULK_MAX) next.add(id)
    return next
  })
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()) }

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeMode = mounted ? viewMode : 'comfortable'
  const { reading, wantToRead, finished, paused, didNotFinish, notInterested } = groupShelf(books)
  const coverShelves = [
    { id: "shelf-paused", title: "Paused", items: paused },
    { id: "shelf-want", title: "Want to read", items: wantToRead },
    { id: "shelf-finished", title: "Finished", items: finished },
    { id: "shelf-dnf", title: "Did not finish", items: didNotFinish },
    { id: "shelf-not-interested", title: "Will not read", items: notInterested },
  ].filter((s) => s.items.length > 0)

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

  const shelf = (items: Book[]) => activeMode === 'comfortable' ? (
    <div className={coverGridClass}>
      {items.map((book) => pickable(book, <BookCoverCard key={book.id} book={book} accentColour={accent} selecting={selecting} />))}
    </div>
  ) : (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {items.map((book) => pickable(book, <CompactBookCard key={book.id} book={book} />))}
    </div>
  )

  const viewToggle = (
    <div className="flex items-center gap-2">
    <button type="button" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
      className="h-10 rounded-full px-4 text-sm font-medium bg-slate-200 dark:bg-slate-700/60 hover:bg-slate-300 dark:hover:bg-slate-700 transition">
      {selecting ? "Done" : "Select"}
    </button>
    <div className="flex gap-1 bg-slate-200 dark:bg-slate-700/60 rounded-full p-1">
      <button type="button" aria-label="Comfortable view" aria-pressed={activeMode === 'comfortable'} onClick={() => setViewMode('comfortable')}
        className={cn("h-8 w-8 rounded-full flex items-center justify-center transition",
          activeMode === 'comfortable' && "bg-white dark:bg-slate-900 shadow-sm")}>
        <LayoutGrid size={18} />
      </button>
      <button type="button" aria-label="Compact view" aria-pressed={activeMode === 'compact'} onClick={() => setViewMode('compact')}
        className={cn("h-8 w-8 rounded-full flex items-center justify-center transition",
          activeMode === 'compact' && "bg-white dark:bg-slate-900 shadow-sm")}>
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
      <ShelfSection id="shelf-all" title="All books" count={books.length} action={viewToggle}>
        {shelf(books)}
      </ShelfSection>
      {bulkBar}
    </div>
  )

  return (
    <div className="w-full">
      <ShelfSection id="shelf-reading" title="Currently reading" count={reading.length}>
        {reading.length > 0 ? (
          <div className={cn("grid grid-cols-1 gap-4", readingGridCols(reading.length))}>
            {reading.map((book) => <CurrentlyReadingCard key={book.id} book={book} accentColour={accent} isReread={isRereading(book, finished)} />)}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3 text-sm text-muted-foreground">
            You&apos;re not reading anything right now. {paused.length > 0
              ? "Resume a paused book, or pick something from Want to read."
              : "Pick something from Want to read and mark it as started."}
          </p>
        )}
      </ShelfSection>

      {/* Empty shelves are hidden; the view toggle sits on whichever cover shelf comes first. */}
      {coverShelves.map(({ id, title, items }) => (
        <ShelfSection key={id} id={id} title={title} count={items.length} action={id === coverShelves[0].id ? viewToggle : undefined}>
          {shelf(items)}
        </ShelfSection>
      ))}
      {bulkBar}
    </div>
  )
}

export default BookGrid
