"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import BookCoverCard from '../cards/BookCoverCard'
import { coverGridClass } from '../books/shelf'
import GrowingList from '../books/GrowingList'

// Someone else's shelf on its own page, read-only, drawn a page of covers at a time.
const PublicShelf: FC<{ books: Book[], accentColour?: string | null }> = ({ books, accentColour }) => (
  <GrowingList items={books} className={coverGridClass}
    render={(book) => <BookCoverCard key={book.id} book={book} accentColour={accentColour} readOnly />} />
)

export default PublicShelf
