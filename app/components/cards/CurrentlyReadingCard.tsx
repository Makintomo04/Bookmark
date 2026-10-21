"use client"
import { FC } from 'react'
import moment from 'moment'
import type { Book } from '@prisma/client'
import { Repeat2 } from 'lucide-react'
import { calculatePercentageComplete } from '@/utils/helpers'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import BookCover from './BookCover'
import BookActions from './BookActions'

interface CurrentlyReadingCardProps {
  book: Book
  accentColour?: string | null
  readOnly?: boolean
}

const CurrentlyReadingCard: FC<CurrentlyReadingCardProps> = ({ book, accentColour, readOnly = false }) => {
  const { title, author, pages, currentPage, startedAt, timesRead } = book
  const bookUpdateModal = useBookUpdateModal()
  const page = currentPage ?? 0
  const progress = Math.round(calculatePercentageComplete(pages, page))
  const isReread = timesRead > 0

  const openProgress = () => {
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, false)
    bookUpdateModal.onOpen(book.id)
  }

  const started = startedAt
    ? `${isReread ? "Rereading since" : "Started"} ${moment(startedAt).format(moment(startedAt).isSame(moment(), 'year') ? 'D MMM' : 'MMM YYYY')}`
    : ""

  return (
    <article className="flex gap-4 p-4 rounded-lg bg-neutral-100 dark:bg-neutral-900">
      <BookCover book={book} fallbackColour={accentColour} variant="thumb" sizes="96px" className="w-16 min-[400px]:w-20 sm:w-24 flex-shrink-0 self-start" />

      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 title={title} className="font-semibold leading-snug line-clamp-2">{title}</h3>
              {isReread && (
                <span
                  title="You've read this book before"
                  className="inline-flex items-center gap-1 rounded-full bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-muted-foreground flex-shrink-0"
                >
                  <Repeat2 size={11} aria-hidden="true" /> Reread
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground truncate">{author}</p>
          </div>
          {!readOnly && <BookActions book={book} onUpdateProgress={openProgress} tone="plain" className="-mr-1.5 -mt-1 flex-shrink-0" />}
        </div>

        <div className="mt-auto pt-4">
          <div className="flex items-baseline justify-between gap-2 text-sm mb-1.5">
            <span className="text-muted-foreground tabular-nums">Page {page} of {pages}</span>
            <span className="font-semibold tabular-nums">{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`${title} progress`}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
          >
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: accentColour || '#F13C3C' }} />
          </div>
          {readOnly ? (
            started && <p className="mt-3 text-xs text-muted-foreground">{started}</p>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground truncate">{started}</span>
              <button
                type="button"
                aria-label={`Update progress for ${title}`}
                onClick={openProgress}
                className="h-8 px-3 flex-shrink-0 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Update<span className="hidden sm:inline"> progress</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export default CurrentlyReadingCard
