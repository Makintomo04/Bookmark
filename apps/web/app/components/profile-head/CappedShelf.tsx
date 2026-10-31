"use client"
import { FC } from 'react'
import Link from 'next/link'
import type { Book } from '@prisma/client'
import BookCoverCard from '../cards/BookCoverCard'
import { SeeAllLink, ShelfSection, coverOnlyGridClass } from '../books/shelf'
import useShelfPreview from '@/app/hooks/useShelfPreview'
import { pillClass } from '../books/ShelfToolbar'

interface CappedShelfProps {
  id: string
  title: string
  books: Book[]
  // Every book on the shelf, when `books` is only the newest of them (profilePreview).
  count?: number
  accentColour?: string | null
  // The shelf's own page, where "See all" goes.
  href: string
}

// A shelf on someone else's profile: the first two rows, then "See all" opens the shelf's own page. Keeps
// their reviews, lists and authors within a scroll or two however much they've read.
const CappedShelf: FC<CappedShelfProps> = ({ id, title, books, count = books.length, accentColour, href }) => {
  // Two rows of covers on this screen.
  const preview = Math.min(useShelfPreview(), books.length)
  return (
  <ShelfSection id={id} title={title} count={count} action={count > preview ? <SeeAllLink href={href} /> : undefined}>
    <div className={coverOnlyGridClass}>
      {books.slice(0, preview).map((book) => <BookCoverCard key={book.id} book={book} accentColour={accentColour} readOnly coversOnly />)}
    </div>
    {count > preview && (
      <div className="mt-6 flex justify-center">
        <Link href={href} className={`${pillClass} inline-flex items-center`}>See all {count.toLocaleString('en-GB')}</Link>
      </div>
    )}
  </ShelfSection>
  )
}

export default CappedShelf
