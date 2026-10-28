"use client"
import { FC, KeyboardEvent } from 'react'
import moment from 'moment'
import type { Book } from '@prisma/client'
import { Status } from '@/lib/bookStatus'
import { Bookmark, Check, Star } from 'lucide-react'
import PrivateBadge from '../books/PrivateBadge'
import { cn } from '@/lib/utils'
import { readableInk } from '@/lib/colour'
import { formatLength, formatPosition, formatStoppedAt, progressWhole } from '@/lib/progress'
import useFavourite from '@/app/hooks/useFavourite'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import { discoverBookOf } from '@/lib/openLibrary'
import BookCover from './BookCover'
import BookActions from './BookActions'
import { recommendedByOf } from '@/lib/recommendRules'
import AuthorLink from '@/app/components/AuthorLink'

interface BookCoverCardProps {
  book: Book
  accentColour?: string | null
  // Someone else's book: the card opens its details instead of the progress modal.
  readOnly?: boolean
  // The shelf's select mode: an empty check on the cover, or a filled one and a ring once picked.
  // BookGrid lays a button over the card that takes the click.
  selected?: boolean | null
  // Which shelf the book is on, for search results that mix shelves.
  shelfLabel?: string
}

const OwnerOverlay: FC<{ book: Book; onUpdateProgress: () => void }> = ({ book, onUpdateProgress }) => {
  const { hasFavourited } = useFavourite()
  return (
    <>
      {/* Darkens the cover slightly on hover so the actions read clearly over light covers. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-md bg-black/0 transition-colors duration-200 md:group-hover:bg-black/20 md:group-focus-within:bg-black/20" />
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

const BookCoverCard: FC<BookCoverCardProps> = ({ book, accentColour, readOnly = false, selected = null, shelfLabel }) => {
  const { title, author, status, rating, completedAt, stoppedAt } = book
  const bookUpdateModal = useBookUpdateModal()
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  const isPaused = status === Status.PAUSED
  const progress = status === Status.STARTED || isPaused ? progressWhole(book) : 0
  const length = formatLength(book)

  const openProgress = () => {
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, status === Status.COMPLETED)
    bookUpdateModal.onOpen(book.id)
  }

  const onActivate = readOnly ? () => openDetails(discoverBookOf(book)) : openProgress

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onActivate()
    }
  }

  const interactiveProps = {
    role: "button",
    tabIndex: 0,
    "aria-label": readOnly ? `About ${title} by ${author}` : `${title} by ${author}. Update progress`,
    onClick: onActivate,
    onKeyDown: handleKeyDown,
  }

  return (
    <div
      {...interactiveProps}
      className="group flex flex-col gap-3 rounded-lg cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      {/* Someone else's book lifts a touch on hover, as Discover's covers do, since there's no overlay to show. */}
      <div className={cn("relative", readOnly && "transition md:group-hover:-translate-y-0.5 md:group-hover:opacity-90")}>
        <BookCover
          book={book}
          sizes="(min-width: 1280px) 180px, (min-width: 1024px) 20vw, (min-width: 640px) 30vw, 45vw"
        />
        {!readOnly && selected === null && <OwnerOverlay book={book} onUpdateProgress={openProgress} />}
        {book.isPrivate && <PrivateBadge className="pointer-events-none absolute bottom-2 left-2" />}
        {selected !== null && (
          <>
            {/* The ring sits just outside the cover; picked covers dim a little so the check reads. */}
            <div aria-hidden style={selected ? { boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${accentColour || 'currentColor'}` } : undefined}
              className={cn("pointer-events-none absolute inset-0 rounded-md transition", selected ? "bg-black/25" : "md:group-hover:bg-black/10")} />
            <span aria-hidden
              style={selected ? { background: accentColour || undefined, borderColor: accentColour || undefined } : undefined}
              className={cn("pointer-events-none absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm transition",
                selected ? "border-foreground bg-foreground text-background" : "border-white/90 bg-black/30")}>
              {selected && <Check size={14} strokeWidth={3} style={accentColour ? { color: readableInk(accentColour) } : undefined} />}
            </span>
          </>
        )}
      </div>

      <div className="min-w-0">
        <h3 title={title} className="text-[15px] font-semibold leading-snug line-clamp-2">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground truncate"><AuthorLink author={author} /></p>

        {(status === Status.STARTED || isPaused) && (
          <div className="mt-2 flex items-center gap-2" title={formatPosition(book, { paused: isPaused })}>
            <div
              role="progressbar"
              aria-label={`${title} progress`}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
            >
              {/* Greyed out while paused: the progress is kept, but it isn't moving. */}
              <div
                className={cn("h-full rounded-full", isPaused && "bg-neutral-400 dark:bg-neutral-500")}
                style={{ width: `${progress}%`, background: isPaused ? undefined : accentColour || '#F13C3C' }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{isPaused ? `Paused · ${progress}%` : `${progress}%`}</span>
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
        {status === Status.DNF && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {rating ? (
              <span className="flex items-center gap-0.5 text-foreground tabular-nums">
                <Star size={12} className="fill-current" aria-hidden />{rating}
              </span>
            ) : null}
            <span className="tabular-nums">
              {formatStoppedAt(book)}{stoppedAt ? ` · ${moment(stoppedAt).format("MMM YYYY")}` : ""}
            </span>
          </p>
        )}
        {status === Status.NOT_STARTED && length && (
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{length}</p>
        )}
        {status === Status.NOT_STARTED && recommendedByOf(book) && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">Recommended by {recommendedByOf(book)}</p>
        )}
        {shelfLabel && (
          <span className="mt-2 inline-flex rounded-full bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{shelfLabel}</span>
        )}
      </div>
    </div>
  )
}

export default BookCoverCard
