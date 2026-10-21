"use client"
import { FC, useEffect, useState } from 'react'
import axios from 'axios'
import moment from 'moment'
import { toast } from 'react-toastify'
import { Book, Status } from '@prisma/client'
import Modal from './Modal'
import BookCover from '../cards/BookCover'
import StarRating from '../StarRating'
import { Button } from '../ui/button'
import { isRereading } from '../books/shelf'
import { cn } from '@/lib/utils'
import { readableInk } from '@/lib/colour'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import useBookEditModal from '@/app/hooks/useBookEditModal'

const QUICK_ADDS = [10, 25, 50]
const PACE_MIN_DAYS = 7

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n))

const formatDay = (date: Date | string) =>
  moment(date).format(moment(date).isSame(moment(), 'year') ? 'D MMMM' : 'D MMMM YYYY')

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

const BookUpdateModal: FC = () => {
  const { user, mutate } = useUser()
  const { books, mutate: booksMutate } = useBooks()
  const { onClose, getBookIsOpen, book } = useBookUpdateModal()
  const bookEditModal = useBookEditModal()
  const isOpen = getBookIsOpen(book?.id, useBookUpdateModal.getState())

  const [pageInput, setPageInput] = useState("0")
  const [finished, setFinished] = useState(false)
  const [pageBeforeFinish, setPageBeforeFinish] = useState<number | null>(null)
  const [showStartPage, setShowStartPage] = useState(false)
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (books && books.length > 0) {
      useBookUpdateModal.getState().myBooks = books.map((b: Book) => ({ id: b.id, isOpen: false, book: b }))
    }
  }, [books])

  useEffect(() => {
    if (!isOpen || !book) return
    setPageInput(String(book.currentPage ?? 0))
    setFinished(false)
    setPageBeforeFinish(null)
    setShowStartPage(false)
    setRating(book.rating ?? 0)
    setReview(book.review ?? "")
  }, [isOpen, book])

  if (!book) return null

  const accent = user?.favColour || '#D92D2D'
  const accentInk = readableInk(accent)
  const status = book.status
  const pages = book.pages
  const hasPageCount = pages > 0
  const startPage = book.currentPage ?? 0
  const typed = parseInt(pageInput, 10)
  const isOverTotal = !isNaN(typed) && typed > pages
  const page = isNaN(typed) ? startPage : clamp(typed, pages)
  const delta = page - startPage
  const progress = hasPageCount ? Math.round((page / pages) * 100) : 0
  const ratingChanged = rating !== (book.rating ?? 0)
  const reviewChanged = review !== (book.review ?? "")

  const hasChanges = status === "STARTED" ? delta !== 0 || finished
    : status === "COMPLETED" ? ratingChanged || reviewChanged
    : false
  const canSave = !isSaving && (status === "NOT_STARTED" || hasChanges)

  const close = () => onClose(book.id)

  const setPage = (n: number) => setPageInput(String(clamp(n, pages)))

  const toggleFinished = () => {
    if (!finished) {
      setPageBeforeFinish(page)
      setPageInput(String(pages))
    } else {
      setPageInput(String(pageBeforeFinish ?? startPage))
      setPageBeforeFinish(null)
    }
    setFinished(!finished)
  }

  const editDetails = () => {
    close()
    bookEditModal.onOpen(book)
  }

  const save = () => {
    if (!canSave) return
    let payload: Record<string, unknown>
    let success: string
    if (status === "NOT_STARTED") {
      payload = { id: book.id, isStarted: true, currentPage: page }
      success = "Started reading"
    } else if (status === "STARTED" && !finished) {
      payload = { id: book.id, currentPage: page }
      success = "Progress saved"
    } else {
      payload = { id: book.id, isComplete: true, rating: rating > 0 ? rating : null, review }
      success = status === "STARTED" ? "Marked as finished"
        : ratingChanged && reviewChanged ? "Rating and review saved"
        : ratingChanged ? "Rating saved" : "Review saved"
    }

    setIsSaving(true)
    axios.post("/api/book-progress", payload).then(() => {
      toast.success(success, { position: "bottom-center" })
      mutate()
      booksMutate()
      close()
    }).catch((err) => {
      toast.error(err?.response?.data?.error || "Couldn't save. Check your connection and try again.", { position: "bottom-center" })
    }).finally(() => setIsSaving(false))
  }

  const readAgain = () => {
    setIsSaving(true)
    axios.post("/api/book-progress", { id: book.id, isRestart: true }).then(() => {
      toast.success("Started reading again", { position: "bottom-center" })
      mutate()
      booksMutate()
      close()
    }).catch(() => {
      toast.error("Couldn't start this book again. Try again.", { position: "bottom-center" })
    }).finally(() => setIsSaving(false))
  }

  const rereading = status === "STARTED"
    && isRereading(book, ((books ?? []) as Book[]).filter((b) => b.status === Status.COMPLETED))
  const meta = status === "STARTED" && book.startedAt
    ? `${rereading ? "Rereading since" : "Started"} ${formatDay(book.startedAt)}`
    : status === "COMPLETED" && book.completedAt
      ? `Finished ${formatDay(book.completedAt)}`
      : status === "NOT_STARTED" ? "On your Want to read shelf" : ""

  const deltaText = status !== "STARTED" || delta === 0 ? ""
    : delta > 0 ? `${plural(delta, "page")} since your last update`
    : `${plural(-delta, "page")} back from your last update`

  // Pauses skew the rate early on, so wait for a week of reading before guessing.
  const daysReading = book.startedAt ? moment().diff(book.startedAt, 'days', true) : 0
  const daysLeft = status === "STARTED" && !finished && hasPageCount && startPage > 0
    && page > 0 && page < pages && daysReading >= PACE_MIN_DAYS
    ? Math.round((pages - page) / (page / daysReading))
    : null
  const paceText = daysLeft === null ? ""
    : daysLeft < 1 ? "Less than a day left at your pace"
    : daysLeft < 14 ? `About ${daysLeft === 1 ? "a day" : `${daysLeft} days`} left at your pace`
    : daysLeft < 60 ? `About ${plural(Math.round(daysLeft / 7), "week")} left at your pace`
    : `About ${plural(Math.round(daysLeft / 30), "month")} left at your pace`

  const pageNumber = (
    <div className="flex items-baseline gap-2">
      {/* The hidden copy sets the width; the input sits over it so it hugs its digits. */}
      <span className="relative inline-block">
        <span aria-hidden="true" className="invisible block border-b-2 px-1 text-5xl font-bold tabular-nums leading-tight whitespace-pre">{pageInput || "0"}</span>
        <input
          id="current-page"
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          size={1}
          value={pageInput}
          aria-describedby="page-total"
          onFocus={(e) => e.target.select()}
          onChange={(e) => setPageInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onBlur={() => setPageInput(String(page))}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            setPageInput(String(page))
            save()
          }}
          disabled={isSaving || finished}
          className="absolute inset-0 w-full rounded-t-md border-b-2 border-dashed border-neutral-300 dark:border-neutral-600 bg-transparent px-1 text-5xl font-bold tabular-nums leading-tight hover:border-neutral-500 focus-visible:outline-none focus-visible:border-solid focus-visible:border-neutral-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </span>
      <span id="page-total" className="text-lg text-muted-foreground tabular-nums whitespace-nowrap">of {pages}</span>
    </div>
  )

  const progressControl = hasPageCount ? (
    <div>
      <label htmlFor="current-page" className="text-sm font-medium text-muted-foreground">You&apos;re on page</label>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        {pageNumber}
        <span className="text-lg font-semibold tabular-nums">{progress}%</span>
      </div>

      {isOverTotal && (
        <p className="mt-2 text-sm text-muted-foreground">
          This book has {pages} pages.{" "}
          <button type="button" onClick={editDetails} className="underline underline-offset-4 hover:text-foreground">Change page count</button>
        </p>
      )}

      <input
        type="range"
        aria-label="Current page"
        aria-valuetext={`Page ${page} of ${pages}`}
        min={0}
        max={pages}
        value={page}
        onChange={(e) => setPage(Number(e.target.value))}
        disabled={isSaving || finished}
        style={{ accentColor: accent }}
        className="mt-4 w-full h-2 cursor-pointer disabled:cursor-default disabled:opacity-60"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex gap-1.5">
          {QUICK_ADDS.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Add ${n} pages`}
              onClick={() => setPage(page + n)}
              disabled={isSaving || finished || page >= pages}
              className="h-10 sm:h-8 px-3.5 sm:px-3 rounded-full text-sm font-medium tabular-nums bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:pointer-events-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              +{n}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:items-end text-sm text-muted-foreground tabular-nums">
          <p aria-live="polite">{deltaText}</p>
          {paceText && <p>{paceText}</p>}
        </div>
      </div>

      {page === pages && !finished && (
        <p className="mt-4 text-sm">
          That&apos;s the last page.{" "}
          <button type="button" onClick={toggleFinished} className="font-medium underline underline-offset-4">Mark it as finished?</button>
        </p>
      )}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">
      This book doesn&apos;t have a page count yet, so progress can&apos;t be tracked.{" "}
      <button type="button" onClick={editDetails} className="font-medium text-foreground underline underline-offset-4">Add the page count</button>
    </p>
  )

  const startControl = showStartPage ? (
    <div className="flex flex-col gap-2">
      <label htmlFor="current-page" className="text-sm font-medium">Current page</label>
      <div className="flex items-center gap-2">
        <input
          id="current-page"
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          autoFocus
          value={pageInput}
          aria-describedby="page-total"
          onFocus={(e) => e.target.select()}
          onChange={(e) => setPageInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onBlur={() => setPageInput(String(page))}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            setPageInput(String(page))
            save()
          }}
          disabled={isSaving}
          className="h-10 w-[120px] rounded-md border border-neutral-300 dark:border-input bg-background px-3 text-base tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <span id="page-total" className="text-sm text-muted-foreground">of {pages}</span>
      </div>
      {isOverTotal && <p className="text-sm text-muted-foreground">This book has {pages} pages.</p>}
    </div>
  ) : (
    <div className="flex flex-col gap-2 items-start">
      <p className="text-sm text-muted-foreground">Starts from the first page.</p>
      {hasPageCount && (
        <button type="button" onClick={() => setShowStartPage(true)} className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground">
          Already partway through? Set your page
        </button>
      )}
    </div>
  )

  const finishedSwitch = (
    <button
      type="button"
      role="switch"
      aria-checked={finished}
      onClick={toggleFinished}
      disabled={isSaving}
      className="flex items-center gap-3 text-left w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", !finished && "bg-neutral-300 dark:bg-neutral-700")}
        style={finished ? { background: accent } : undefined}
      >
        <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", finished && "translate-x-5")} />
      </span>
      <span className="text-sm font-medium">I finished it</span>
    </button>
  )

  const ratingAndReview = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Rating <span className="font-normal text-muted-foreground">· optional</span></span>
        <StarRating value={rating} onChange={(n) => setRating(n === rating ? 0 : n)} disabled={isSaving} label="Your rating" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="review" className="text-sm font-medium">
          Review <span className="font-normal text-muted-foreground">· optional</span>
        </label>
        <textarea
          id="review"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="What did you think?"
          disabled={isSaving}
          className="w-full rounded-md border border-neutral-300 dark:border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
        />
      </div>
    </div>
  )

  const body = (
    <div className="w-full px-6 self-start flex flex-col md:flex-row gap-6 md:gap-10">
      <div className="flex md:flex-col gap-4 md:w-56 shrink-0">
        <BookCover book={book} fallbackColour={user?.favColour} variant="thumb" sizes="(min-width: 768px) 224px, 72px" className="w-[72px] md:w-full shrink-0 self-start shadow-sm" />
        <div className="min-w-0">
          <p className="text-lg md:text-xl font-bold leading-snug break-words">{book.title}</p>
          <p className="text-sm text-muted-foreground">{book.author}</p>
          {meta && <p className="mt-2 text-xs text-muted-foreground">{meta}</p>}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-8">
        {status === "NOT_STARTED" && startControl}
        {status === "STARTED" && progressControl}
        {status === "STARTED" && finishedSwitch}
        {(status === "COMPLETED" || finished) && ratingAndReview}
      </div>
    </div>
  )

  const primaryLabel = status === "NOT_STARTED" ? "Start reading"
    : status === "COMPLETED" ? "Save"
    : finished ? "Mark as finished" : "Save progress"

  // A finished book is mostly opened to look; only offer Save once there's something to save.
  const showPrimary = status !== "COMPLETED" || hasChanges

  const footer = (
    <div className="w-full p-6 flex flex-wrap items-center justify-end gap-3">
      {status === "COMPLETED" && (
        <Button onClick={readAgain} variant="outline" className="rounded-md mr-auto" disabled={isSaving}>Read again</Button>
      )}
      <Button onClick={close} variant="outline" className="rounded-md hidden sm:inline-flex" disabled={isSaving}>
        {showPrimary ? "Cancel" : "Close"}
      </Button>
      {showPrimary && (
        <Button style={{ background: accent, color: accentInk }} onClick={save} disabled={!canSave}>
          {primaryLabel}
        </Button>
      )}
    </div>
  )

  return (
    <Modal
      title={status === "NOT_STARTED" ? "Start reading" : status === "COMPLETED" ? "Rating and review" : "Update progress"}
      body={body}
      footer={footer}
      onClose={close}
      isOpen={isOpen}
      disabled={isSaving}
      closeOnBackdrop={!hasChanges}
      compact
    />
  )
}

export default BookUpdateModal
