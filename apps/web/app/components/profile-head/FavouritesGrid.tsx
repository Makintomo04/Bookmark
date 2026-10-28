"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import BookCoverCard from '../cards/BookCoverCard'
import { coverGridClass } from '../books/shelf'
import GrowingList from '../books/GrowingList'

// Another reader's favourites, read-only, a page of covers at a time.
const FavouritesGrid: FC<{ books: Book[], accentColour?: string | null }> = ({ books, accentColour }) => (
  <GrowingList items={books} className={coverGridClass}
    render={(book) => <BookCoverCard key={book.id} book={book} accentColour={accentColour} readOnly />} />
)

export default FavouritesGrid
