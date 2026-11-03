"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import BookCoverCard from '../cards/BookCoverCard'
import { coverGridClass } from '../books/shelf'
import GrowingList from '../books/GrowingList'
import FavouriteRankBadge from '../books/FavouriteRankBadge'
import { TOP_FAVOURITES } from '@/lib/favourites'

// Another reader's favourites, in their order, read-only, a page of covers at a time. Their top four are numbered.
const FavouritesGrid: FC<{ books: Book[], accentColour?: string | null }> = ({ books, accentColour }) => {
  const rank = new Map(books.slice(0, TOP_FAVOURITES).map((b, i) => [b.id, i + 1]))
  return (
    <GrowingList items={books} className={coverGridClass}
      render={(book) => (
        <div key={book.id} className="relative">
          {rank.has(book.id) && <FavouriteRankBadge rank={rank.get(book.id)!} className="left-3 top-3" />}
          <BookCoverCard book={book} accentColour={accentColour} readOnly />
        </div>
      )} />
  )
}

export default FavouritesGrid
