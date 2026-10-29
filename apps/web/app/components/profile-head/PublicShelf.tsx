"use client"
import { FC, useMemo, useState } from 'react'
import type { Book } from '@prisma/client'
import BookCoverCard from '../cards/BookCoverCard'
import { coverOnlyGridClass } from '../books/shelf'
import GrowingList from '../books/GrowingList'
import ShelfToolbar from '../books/ShelfToolbar'
import { EMPTY_FILTER, isNarrowed, matchesFilter, shelfParams, sortBooks, type ShelfFilter, type ShelfKey } from '@/lib/shelfFilter'

interface PublicShelfProps {
  books: Book[]
  shelf: ShelfKey
  accentColour?: string | null
}

// Someone else's shelf on its own page, read-only: the same search, sort and filters as your own shelf, over
// what their profile shows (no private tags or formats), drawn a page of covers at a time.
const PublicShelf: FC<PublicShelfProps> = ({ books, shelf, accentColour }) => {
  const [filter, setFilter] = useState<ShelfFilter>({ ...EMPTY_FILTER, shelf })
  const matches = useMemo(() => sortBooks(books.filter((b) => matchesFilter(b, filter)), filter.sort), [books, filter])
  const narrowed = isNarrowed(filter)

  return (
    <>
      <ShelfToolbar books={books} filter={filter} onChange={setFilter} />
      {narrowed && (
        <h2 className="mb-5 text-lg font-semibold tabular-nums">
          {matches.length === 1 ? "1 book matches" : `${matches.length.toLocaleString('en-GB')} books match`}
        </h2>
      )}
      {matches.length > 0
        ? <GrowingList items={matches} className={coverOnlyGridClass} resetKey={shelfParams(filter).toString()}
            render={(book) => <BookCoverCard key={book.id} book={book} accentColour={accentColour} readOnly coversOnly />} />
        : <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-3 text-sm text-muted-foreground">
            Nothing on this shelf matches that. Try fewer words, or clear the filters.
          </p>}
    </>
  )
}

export default PublicShelf
