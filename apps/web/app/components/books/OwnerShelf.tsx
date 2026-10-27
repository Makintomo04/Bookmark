"use client"
import { FC } from 'react'
import { Book } from '@prisma/client'
import useBooks from '@/app/hooks/useBooks'
import type { ShelfKey } from '@/lib/shelfFilter'
import Loader from '../Loader'
import FetchErrorState from '../FetchErrorState'
import BookGrid from './BookGrid'

// One of your shelves on its own page: the shelf's search, sort, filters and select mode over every book on it.
const OwnerShelf: FC<{ shelf: ShelfKey }> = ({ shelf }) => {
  const { books, isLoading, isError, mutate } = useBooks()
  if (isError) return <FetchErrorState error={isError} what="your books" onRetry={() => mutate()} />
  if (isLoading || !books) return <Loader />
  return <BookGrid books={books as Book[]} shelf={shelf} />
}

export default OwnerShelf
