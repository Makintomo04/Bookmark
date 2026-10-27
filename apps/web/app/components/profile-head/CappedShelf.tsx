"use client"
import { FC } from 'react'
import Link from 'next/link'
import type { Book } from '@prisma/client'
import BookCoverCard from '../cards/BookCoverCard'
import { SHELF_PREVIEW, ShelfSection, coverGridClass } from '../books/shelf'
import { pillClass } from '../books/ShelfToolbar'

interface CappedShelfProps {
  id: string
  title: string
  books: Book[]
  accentColour?: string | null
  // The shelf's own page, where "See all" goes.
  href: string
}

// A shelf on someone else's profile: the first two rows, then "See all" opens the shelf's own page. Keeps
// their reviews, lists and authors within a scroll or two however much they've read.
const CappedShelf: FC<CappedShelfProps> = ({ id, title, books, accentColour, href }) => (
  <ShelfSection id={id} title={title} count={books.length}>
    <div className={coverGridClass}>
      {books.slice(0, SHELF_PREVIEW).map((book) => <BookCoverCard key={book.id} book={book} accentColour={accentColour} readOnly />)}
    </div>
    {books.length > SHELF_PREVIEW && (
      <div className="mt-6 flex justify-center">
        <Link href={href} className={`${pillClass} inline-flex items-center`}>See all {books.length.toLocaleString('en-GB')}</Link>
      </div>
    )}
  </ShelfSection>
)

export default CappedShelf
