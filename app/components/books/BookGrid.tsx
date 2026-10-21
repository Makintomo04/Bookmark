"use client"
import { FC, useEffect, useState } from 'react'
import { Book } from '@prisma/client'
import { LayoutGrid, Grid3x3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import useUser from '@/app/hooks/useUser'
import useViewMode from '@/app/hooks/useViewMode'
import BookCoverCard from '../cards/BookCoverCard'
import CompactBookCard from '../cards/CompactBookCard'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { ShelfSection, coverGridClass, groupShelf, isRereading, readingGridCols } from './shelf'

interface BookGridProps {
  books: Book[]
}

const BookGrid: FC<BookGridProps> = ({ books }) => {
  const [mounted, setMounted] = useState(false)
  const { viewMode, setViewMode } = useViewMode()
  const { user } = useUser()
  const accent = user?.favColour

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeMode = mounted ? viewMode : 'comfortable'
  const { reading, wantToRead, finished, paused, didNotFinish } = groupShelf(books)
  const coverShelves = [
    { id: "shelf-paused", title: "Paused", items: paused },
    { id: "shelf-want", title: "Want to read", items: wantToRead },
    { id: "shelf-finished", title: "Finished", items: finished },
    { id: "shelf-dnf", title: "Did not finish", items: didNotFinish },
  ].filter((s) => s.items.length > 0)

  const shelf = (items: Book[]) => activeMode === 'comfortable' ? (
    <div className={coverGridClass}>
      {items.map((book) => <BookCoverCard key={book.id} book={book} accentColour={accent} />)}
    </div>
  ) : (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {items.map((book) => <CompactBookCard key={book.id} book={book} />)}
    </div>
  )

  const viewToggle = (
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
    </div>
  )
}

export default BookGrid
