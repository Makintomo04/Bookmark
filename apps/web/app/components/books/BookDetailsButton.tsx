"use client"
import { FC, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { discoverBookOf } from '@/lib/openLibrary'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'

interface BookDetailsButtonProps {
  book: Parameters<typeof discoverBookOf>[0]
  children: ReactNode
  className?: string
  // For a second way in to the same book (a cover beside its title): clickable, but skipped by
  // the keyboard and screen readers so the book isn't announced twice.
  duplicate?: boolean
}

// Opens a reader's book in the book details modal, for markup that otherwise renders on the server.
const BookDetailsButton: FC<BookDetailsButtonProps> = ({ book, children, className, duplicate = false }) => {
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  return (
    <button
      type="button"
      onClick={() => openDetails(discoverBookOf(book))}
      tabIndex={duplicate ? -1 : undefined}
      aria-hidden={duplicate || undefined}
      className={cn("text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", className)}
    >
      {children}
    </button>
  )
}

export default BookDetailsButton
