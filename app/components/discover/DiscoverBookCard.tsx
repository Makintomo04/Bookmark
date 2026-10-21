"use client"
import { FC, ReactNode } from 'react'
import BookCover from '../cards/BookCover'
import AddToShelfButton from './AddToShelfButton'
import AddToListButton from './AddToListButton'
import type { DiscoverBook } from '@/lib/openLibrary'
import type { Reason } from '@/lib/listRules'
import CuratorNote from '../lists/CuratorNote'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'

interface DiscoverBookCardProps {
  book: DiscoverBook
  // A person's reason for the book (a list note or review), shown under it and in its details.
  reason?: Reason | null
  // Extra context under the reason, e.g. which list it's on.
  context?: ReactNode
  rank?: number
}

const DiscoverBookCard: FC<DiscoverBookCardProps> = ({ book, reason, context, rank }) => {
  const openDetails = useBookDetailsModal((s) => s.onOpen)

  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      {/* Cover and title open the book's details, so readers can see what it's about before shelving it. */}
      <button
        type="button"
        onClick={() => openDetails(book, reason)}
        aria-label={`About ${book.title} by ${book.author}`}
        className="group flex flex-col gap-2.5 min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative w-full transition group-hover:-translate-y-0.5 group-hover:opacity-90">
          <BookCover
            book={{ title: book.title, author: book.author, coverImage: book.coverUrl || "", cardColour: null }}
            sizes="(min-width: 1024px) 180px, (min-width: 640px) 25vw, 45vw"
            className="shadow-sm group-hover:shadow-md"
          />
          {rank !== undefined && (
            <span className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-background/90 text-xs font-bold tabular-nums shadow">{rank}</span>
          )}
        </div>
        <div className="min-w-0 w-full">
          <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline underline-offset-2">{book.title}</p>
          <p className="text-xs text-muted-foreground truncate">{book.author}</p>
        </div>
      </button>
      {reason && <CuratorNote reason={reason} className="-mt-0.5" />}
      {context}
      <div className="mt-auto flex items-center gap-1.5">
        <AddToShelfButton book={book} />
        <AddToListButton book={book} />
      </div>
    </div>
  )
}

export default DiscoverBookCard
