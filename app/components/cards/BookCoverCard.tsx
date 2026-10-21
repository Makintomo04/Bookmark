"use client"
import { FC, KeyboardEvent } from 'react'
import moment from 'moment'
import { Status, type Book } from '@prisma/client'
import { Bookmark, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { calculatePercentageComplete } from '@/utils/helpers'
import useFavourite from '@/app/hooks/useFavourite'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import BookCover from './BookCover'
import BookActions from './BookActions'

interface BookCoverCardProps {
  book: Book
  accentColour?: string | null
  readOnly?: boolean
}

const OwnerOverlay: FC<{ book: Book; onUpdateProgress: () => void }> = ({ book, onUpdateProgress }) => {
  const { hasFavourited } = useFavourite()
  return (
    <>
      <BookActions
        book={book}
        onUpdateProgress={onUpdateProgress}
        className="absolute top-2 right-2 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100"
      />
      {hasFavourited(book.id) && (
        <Bookmark size={18} aria-hidden className="absolute top-0 left-3 fill-[#F13C3C] text-[#F13C3C] md:group-hover:opacity-0 transition" />
      )}
    </>
  )
}

const BookCoverCard: FC<BookCoverCardProps> = ({ book, accentColour, readOnly = false }) => {
  const { title, author, status, rating, pages, currentPage, completedAt } = book
  const bookUpdateModal = useBookUpdateModal()
  const progress = status === Status.STARTED ? Math.round(calculatePercentageComplete(pages, currentPage ?? 0)) : 0

  const openProgress = () => {
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, status === Status.COMPLETED)
    bookUpdateModal.onOpen(book.id)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openProgress()
    }
  }

  const interactiveProps = readOnly ? {} : {
    role: "button",
    tabIndex: 0,
    "aria-label": `${title} by ${author}. Update progress`,
    onClick: openProgress,
    onKeyDown: handleKeyDown,
  }

  return (
    <div
      {...interactiveProps}
      className={cn(
        "group flex flex-col gap-3 rounded-lg",
        !readOnly && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      )}
    >
      <div className={cn("relative", !readOnly && "transition duration-200 group-hover:-translate-y-1")}>
        <BookCover
          book={book}
          fallbackColour={accentColour}
          sizes="(min-width: 1280px) 180px, (min-width: 1024px) 20vw, (min-width: 640px) 30vw, 45vw"
        />
        {!readOnly && <OwnerOverlay book={book} onUpdateProgress={openProgress} />}
      </div>

      <div className="min-w-0">
        <h3 title={title} className="text-[15px] font-semibold leading-snug line-clamp-2">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground truncate">{author}</p>

        {status === Status.STARTED && (
          <div className="mt-2 flex items-center gap-2" title={`Page ${currentPage ?? 0} of ${pages}`}>
            <div
              role="progressbar"
              aria-label={`${title} progress`}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
            >
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: accentColour || '#F13C3C' }} />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
          </div>
        )}
        {status === Status.COMPLETED && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {rating ? (
              <span className="flex items-center gap-0.5 text-foreground tabular-nums">
                <Star size={12} className="fill-current" aria-hidden />{rating}
              </span>
            ) : null}
            <span>{completedAt ? `Read ${moment(completedAt).format("MMM YYYY")}` : "Read"}</span>
          </p>
        )}
        {status === Status.NOT_STARTED && pages > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{pages} pages</p>
        )}
      </div>
    </div>
  )
}

export default BookCoverCard
