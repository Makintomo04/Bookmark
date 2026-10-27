"use client"
import { FC, useState } from 'react'
import type { Book } from '@prisma/client'
import BookCoverCard from '../cards/BookCoverCard'
import { SHELF_PREVIEW, ShelfSection, coverGridClass } from '../books/shelf'
import GrowingList from '../books/GrowingList'
import { pillClass } from '../books/ShelfToolbar'

interface CappedShelfProps {
  id: string
  title: string
  books: Book[]
  accentColour?: string | null
}

// A shelf on someone else's profile: the first two rows, then "See all" opens the rest in place, a page at
// a time. Keeps their reviews, lists and authors within a scroll or two however much they've read.
const CappedShelf: FC<CappedShelfProps> = ({ id, title, books, accentColour }) => {
  const [all, setAll] = useState(false)
  const card = (book: Book) => <BookCoverCard key={book.id} book={book} accentColour={accentColour} readOnly />
  return (
    <ShelfSection id={id} title={title} count={books.length}>
      {all
        ? <GrowingList items={books} render={card} className={coverGridClass} />
        : <div className={coverGridClass}>{books.slice(0, SHELF_PREVIEW).map(card)}</div>}
      {books.length > SHELF_PREVIEW && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => setAll((v) => !v)} className={pillClass}>
            {all ? "Show fewer" : `See all ${books.length.toLocaleString('en-GB')}`}
          </button>
        </div>
      )}
    </ShelfSection>
  )
}

export default CappedShelf
