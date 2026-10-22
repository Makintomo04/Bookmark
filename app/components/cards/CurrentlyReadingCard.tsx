"use client"
import { FC } from 'react'
import moment from 'moment'
import type { Book } from '@prisma/client'
import { Pencil, Repeat2 } from 'lucide-react'
import { formatPosition, progressWhole } from '@/lib/progress'
import { readableInk } from '@/lib/colour'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import BookCover from './BookCover'
import BookActions from './BookActions'

interface CurrentlyReadingCardProps {
  book: Book
  accentColour?: string | null
  readOnly?: boolean
  isReread?: boolean
}

const CurrentlyReadingCard: FC<CurrentlyReadingCardProps> = ({ book, accentColour, readOnly = false, isReread = false }) => {
  const { title, author, startedAt } = book
  const bookUpdateModal = useBookUpdateModal()
  const progress = progressWhole(book)
  const position = formatPosition(book)
  const accent = accentColour || '#F13C3C'

  const openProgress = () => {
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, false)
    bookUpdateModal.onOpen(book.id)
  }

  const started = startedAt
    ? `${isReread ? "Rereading since" : "Started"} ${moment(startedAt).format(moment(startedAt).isSame(moment(), 'year') ? 'D MMM' : 'MMM YYYY')}`
    : ""

  const bar = (
    <div className="h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${progress}%`, background: accent }} />
    </div>
  )

  const counts = (
    <div className="flex items-baseline justify-between gap-2 text-sm mb-1.5">
      <span className="text-muted-foreground tabular-nums">{position}</span>
      <span className="font-semibold tabular-nums">{progress}%</span>
    </div>
  )

  return (
    <article className="flex gap-4 p-4 rounded-lg bg-neutral-100 dark:bg-neutral-900">
      {/* Stretches with the card so a long title never leaves a gap under the cover. */}
      <BookCover book={book} fallbackColour={accentColour} variant="thumb" sizes="96px" className="w-auto h-auto min-w-20 sm:min-w-24 flex-shrink-0 self-stretch" />

      <div className="min-w-0 flex-1 flex flex-col">
        {/* Only the title shares a row with the actions; the details below get the column's full width. */}
        <div className="flex items-start justify-between gap-2">
          <h3 title={title} className="min-w-0 font-semibold leading-snug line-clamp-2">{title}</h3>
          <div className="flex items-center gap-1.5 flex-shrink-0 -mr-1.5 -mt-1">
            {isReread && (
              <span
                title="You've read this book before"
                className="inline-flex items-center gap-1 rounded-full bg-amber-400 dark:bg-amber-500 px-2 py-1 text-[11px] font-semibold text-amber-950"
              >
                <Repeat2 size={11} aria-hidden="true" /> Reread
              </span>
            )}
            {!readOnly && <BookActions book={book} onUpdateProgress={openProgress} tone="plain" />}
          </div>
        </div>
        <div className="mb-2">
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{author}</p>
          {started && <p className="mt-1 text-xs text-muted-foreground">{started}</p>}
        </div>

        {readOnly ? (
          <div className="mt-auto pt-2">
            {counts}
            <div role="progressbar" aria-label={`${title} progress`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="flex">
              {bar}
            </div>
          </div>
        ) : (
          // The whole progress area is the target; the round button just shows where to tap.
          <button
            type="button"
            onClick={openProgress}
            aria-label={`Update progress for ${title}, ${position}, ${progress}%`}
            className="group mt-auto -mx-2 -mb-2 p-2 rounded-md text-left transition hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          >
            {counts}
            <div className="flex items-center gap-3">
              {bar}
              <span
                aria-hidden
                style={{ background: accent, color: readableInk(accent) }}
                className="grid size-7 flex-shrink-0 place-items-center rounded-full shadow-sm transition group-hover:scale-110 group-active:scale-95"
              >
                <Pencil size={14} strokeWidth={2.5} />
              </span>
            </div>
          </button>
        )}
      </div>
    </article>
  )
}

export default CurrentlyReadingCard
