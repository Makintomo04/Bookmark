"use client"
import { FC, useEffect, useState } from 'react'
import axios from 'axios'
import moment from 'moment'
import { notify, apiError } from '@/lib/notify'
import type { Book } from '@prisma/client'
import { Status } from '@/lib/bookStatus'
import { Lock, Send, Unlock } from 'lucide-react'
import Modal from './Modal'
import BookCover from '../cards/BookCover'
import StarRating from '../StarRating'
import { Button } from '../ui/button'
import { isRereading } from '../books/shelf'
import { moveBook, setBookPrivacy, type ShelfAction } from '../books/ShelfMenuItems'
import PrivateBadge from '../books/PrivateBadge'
import useBookReads from '@/app/hooks/useBookReads'
import { cn } from '@/lib/utils'
import { readableInk } from '@/lib/colour'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import useBookEditModal from '@/app/hooks/useBookEditModal'
import useRecommendModal from '@/app/hooks/useRecommendModal'
import BuddyReadEntry from '../buddy-reads/BuddyReadEntry'
import CatchMeUp from '../books/CatchMeUp'
import { copyCoverLater, refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { celebrate } from '@/app/hooks/useEarnMoment'
import { QUICK_ADDS, formatMinutes, formatStoppedAt, progressScale } from '@/lib/progress'
import useWorkTags from '@/app/hooks/useWorkTags'
import type { ReaderTagsInput } from '@/lib/workTags'
import { EMPTY_TAGS, ReaderTagsEditor, WorkTagsSummary, sameTags } from '../books/WorkTags'
import AuthorLink from '@/app/components/AuthorLink'
import Link from 'next/link'
import { bookHref } from '@/lib/workKey'

const PACE_MIN_DAYS = 7

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n))

const formatDay = (date: Date | string) =>
  moment(date).format(moment(date).isSame(moment(), 'year') ? 'D MMMM' : 'D MMMM YYYY')

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

// Quiet text actions under the cover. The padding gives each a full-height target and room for the focus
// ring; the negative margin keeps the text lined up with the title above.
const bookActionClass = "-mx-1.5 inline-flex h-9 sm:h-8 items-center gap-1.5 rounded-md px-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const BookUpdateModal: FC = () => {
  const { user, mutate } = useUser()
  const { books, mutate: booksMutate } = useBooks()
  const { onClose, getBookIsOpen, book } = useBookUpdateModal()
  const bookEditModal = useBookEditModal()
  const recommendModal = useRecommendModal()
  const isOpen = getBookIsOpen(book?.id, useBookUpdateModal.getState())
  const { reads, mutate: readsMutate } = useBookReads(isOpen ? book?.id : null)
  const { tags: workTags, mutate: tagsMutate } = useWorkTags({ bookId: isOpen ? book?.id : null })

  const [pageInput, setPageInput] = useState("0")
  // Moods and content warnings, tagged along with the review.
  const [tags, setTags] = useState<ReaderTagsInput>(EMPTY_TAGS)
  const [finished, setFinished] = useState(false)
  // Marking a book you're reading as did not finish. Like `finished`, it swaps in rating and review.
  const [stopping, setStopping] = useState(false)
  const [pageBeforeFinish, setPageBeforeFinish] = useState<number | null>(null)
  const [showStartPage, setShowStartPage] = useState(false)
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState("")
  const [reviewSpoiler, setReviewSpoiler] = useState(false)
  const [reviewPrivate, setReviewPrivate] = useState(false)
  // The whole book private, not just the review. Saved on its own, straight away (togglePrivate).
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (books && books.length > 0) {
      // The list reloads behind an open modal (e.g. once a new book's cover is copied), so keep which one is open.
      useBookUpdateModal.setState((state) => {
        const open = new Set(state.myBooks.filter((b) => b.isOpen).map((b) => b.id))
        return { myBooks: books.map((b: Book) => ({ id: b.id, isOpen: open.has(b.id), book: b })) }
      })
    }
  }, [books])

  useEffect(() => {
    if (!isOpen || !book) return
    setPageInput(String(progressScale(book).current))
    setFinished(false)
    setStopping(false)
    setPageBeforeFinish(null)
    setShowStartPage(false)
    setRating(book.rating ?? 0)
    setReview(book.review ?? "")
    setReviewSpoiler(!!book.reviewSpoiler)
    setReviewPrivate(!!book.reviewPrivate)
    setIsPrivate(!!book.isPrivate)
  }, [isOpen, book])

  useEffect(() => {
    if (isOpen) setTags(workTags?.mine ?? EMPTY_TAGS)
  }, [isOpen, workTags])

  if (!book) return null

  const accent = user?.favColour || '#D92D2D'
  const accentInk = readableInk(accent)
  const status = book.status
  // The book's own scale: pages, or minutes listened for an audiobook. `pages` is that scale's
  // total and `page` the position on it, whichever unit it is.
  const { unit, total: pages, current: startPage } = progressScale(book)
  const onMinutes = unit === "MINUTES"
  const unitWord = onMinutes ? "minute" : "page"
  const fmt = (n: number) => (onMinutes ? formatMinutes(n) : String(n))
  const hasPageCount = pages > 0
  const typed = parseInt(pageInput, 10)
  const isOverTotal = !isNaN(typed) && typed > pages
  const page = isNaN(typed) ? startPage : clamp(typed, pages)
  const delta = page - startPage
  const progress = hasPageCount ? Math.round((page / pages) * 100) : 0
  const ratingChanged = rating !== (book.rating ?? 0)
  const reviewChanged = review !== (book.review ?? "")
    || reviewSpoiler !== !!book.reviewSpoiler || reviewPrivate !== !!book.reviewPrivate
  const tagsChanged = !sameTags(tags, workTags?.mine ?? EMPTY_TAGS)
  // The position field the API reads for this book's unit.
  const at = (n: number) => (onMinutes ? { currentMinute: n } : { currentPage: n })

  // A paused book shows the same progress controls as one being read, and saving resumes it.
  const isActive = status === "STARTED" || status === "PAUSED"
  const isClosed = status === "COMPLETED" || status === "DNF"
  const hasChanges = isActive ? delta !== 0 || finished || stopping
    : isClosed ? ratingChanged || reviewChanged || tagsChanged
    : false
  const canSave = !isSaving && (status === "NOT_STARTED" || status === "PAUSED" || hasChanges)

  const close = () => onClose(book.id)
  // Its book page, when it's matched to an Open Library work.
  const pageHref = bookHref(book)

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
    setStopping(false)
  }

  // The page stays editable while stopping: it's where the reader gave up.
  const toggleStopping = () => {
    if (finished) {
      setPageInput(String(pageBeforeFinish ?? startPage))
      setPageBeforeFinish(null)
      setFinished(false)
    }
    setStopping(!stopping)
  }

  const editDetails = () => {
    close()
    bookEditModal.onOpen(book)
  }

  // One quiet link in the book block in every state, plus a toast action the moment a book is finished,
  // when "you have to read this" is strongest. This modal closes first, so the two never stack.
  const sendToFriend = () => {
    close()
    recommendModal.onOpen(book.id, book.title)
  }

  const save = () => {
    if (!canSave) return
    let payload: Record<string, unknown>
    // Only a move between shelves gets a toast: the book leaves the shelf you are looking at.
    let success: string | null
    const ratingAndReviewPayload = { rating: rating > 0 ? rating : null, review, reviewSpoiler, reviewPrivate }
    if (status === "NOT_STARTED") {
      payload = { id: book.id, action: "start", ...at(page) }
      success = onMinutes ? "Started listening" : "Started reading"
    } else if (isActive && finished) {
      payload = { id: book.id, action: "complete", ...ratingAndReviewPayload }
      success = "Marked as finished"
    } else if (isActive && stopping) {
      payload = { id: book.id, action: "dnf", ...at(page), ...ratingAndReviewPayload }
      success = "Moved to Did not finish"
    } else if (status === "STARTED") {
      payload = { id: book.id, action: "progress", ...at(page) }
      success = null
    } else if (status === "PAUSED") {
      payload = { id: book.id, action: "resume", ...at(page) }
      success = onMinutes ? "Back to Currently listening" : "Back to Currently reading"
    } else {
      payload = { id: book.id, action: "rate", ...ratingAndReviewPayload }
      success = null
    }

    // Tags go to the shared Work in their own request; the rating and shelf change don't wait on it.
    const saveTags = (isClosed || finished || stopping) && tagsChanged
      ? axios.put("/api/works/tags", { bookId: book.id, ...tags }).then(() => tagsMutate())
        .catch((err) => notify.error(apiError(err, "Couldn't save your moods and warnings.")))
      : Promise.resolve()

    // Read now: by the time the toast's action is pressed, this modal has closed and moved on.
    const { id: bookId, title: bookTitle } = book
    const sendAction = isActive && finished
      ? { action: { label: "Send to a friend", onClick: () => recommendModal.onOpen(bookId, bookTitle) } }
      : undefined

    setIsSaving(true)
    axios.post("/api/book-progress", payload).then(async ({ data: saved }) => {
      await saveTags
      celebrate(saved?.earnMoment, success ? { message: success, ...sendAction } : null)
      mutate()
      refreshAfterBookChange()
      readsMutate()
      close()
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't save. Check your connection and try again."), { retry: save })
    }).finally(() => setIsSaving(false))
  }

  // Pause keeps the page typed in; the other moves don't take one.
  const move = (action: ShelfAction) => {
    setIsSaving(true)
    moveBook(book.id, action, action === "pause" ? at(page) : {}).then((ok) => {
      if (!ok) return
      mutate()
      booksMutate()
      readsMutate()
      close()
    }).finally(() => setIsSaving(false))
  }

  // Applies straight away, apart from the progress form: it's about who sees the book, not the read.
  const togglePrivate = () => {
    setIsSaving(true)
    setBookPrivacy(book.id, !isPrivate).then((ok) => {
      if (!ok) return
      setIsPrivate(!isPrivate)
      booksMutate()
    }).finally(() => setIsSaving(false))
  }

  const rereading = status === "STARTED"
    && isRereading(book, ((books ?? []) as Book[]).filter((b) => b.status === Status.COMPLETED))
  const meta = status === "STARTED" && book.startedAt
    ? `${rereading ? "Rereading since" : "Started"} ${formatDay(book.startedAt)}`
    : status === "COMPLETED" && book.completedAt
      ? `Finished ${formatDay(book.completedAt)}`
      : status === "PAUSED" ? `Paused${book.stoppedAt ? ` since ${formatDay(book.stoppedAt)}` : ""}`
      : status === "DNF" ? `${formatStoppedAt(book)} of ${fmt(pages)}${book.stoppedAt ? ` on ${formatDay(book.stoppedAt)}` : ""}`
      : status === "NOT_STARTED" ? "On your Want to read shelf"
      : status === "NOT_INTERESTED" ? "On your Will not read shelf. Only you can see it." : ""

  const deltaText = !isActive || delta === 0 ? ""
    : delta > 0 ? `${onMinutes ? formatMinutes(delta) : plural(delta, "page")} since your last update`
    : `${onMinutes ? formatMinutes(-delta) : plural(-delta, "page")} back from your last update`

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
      <span id="page-total" className="text-lg text-muted-foreground tabular-nums whitespace-nowrap">
        {onMinutes ? <>min · {formatMinutes(page)} of {formatMinutes(pages)}</> : <>of {pages}</>}
      </span>
    </div>
  )

  const progressControl = hasPageCount ? (
    <div>
      <label htmlFor="current-page" className="text-sm font-medium text-muted-foreground">{onMinutes ? "You've listened for" : "You're on page"}</label>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        {pageNumber}
        <span className="text-lg font-semibold tabular-nums">{progress}%</span>
      </div>

      {isOverTotal && (
        <p className="mt-2 text-sm text-muted-foreground">
          {onMinutes ? `This audiobook runs ${formatMinutes(pages)}.` : `This book has ${pages} pages.`}{" "}
          <button type="button" onClick={editDetails} className="underline underline-offset-4 hover:text-foreground">{onMinutes ? "Change running time" : "Change page count"}</button>
        </p>
      )}

      <input
        type="range"
        aria-label={onMinutes ? "Minutes listened" : "Current page"}
        aria-valuetext={onMinutes ? `${formatMinutes(page)} of ${formatMinutes(pages)}` : `Page ${page} of ${pages}`}
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
          {QUICK_ADDS[unit].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Add ${n} ${unitWord}s`}
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
          {onMinutes ? "That's the end." : "That's the last page."}{" "}
          <button type="button" onClick={toggleFinished} className="font-medium underline underline-offset-4">Mark it as finished?</button>
        </p>
      )}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">
      This book doesn&apos;t have a page count or running time yet, so progress can&apos;t be tracked.{" "}
      <button type="button" onClick={editDetails} className="font-medium text-foreground underline underline-offset-4">Add it</button>
    </p>
  )

  const startControl = showStartPage ? (
    <div className="flex flex-col gap-2">
      <label htmlFor="current-page" className="text-sm font-medium">{onMinutes ? "Minutes listened so far" : "Current page"}</label>
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
          className="h-10 w-[120px] rounded-md border border-input bg-background px-3 text-base tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <span id="page-total" className="text-sm text-muted-foreground">of {fmt(pages)}</span>
      </div>
      {isOverTotal && <p className="text-sm text-muted-foreground">{onMinutes ? `This audiobook runs ${formatMinutes(pages)}.` : `This book has ${pages} pages.`}</p>}
    </div>
  ) : (
    <div className="flex flex-col gap-2 items-start">
      <p className="text-sm text-muted-foreground">{onMinutes ? "Starts from the beginning." : "Starts from the first page."}</p>
      {hasPageCount && (
        <button type="button" onClick={() => setShowStartPage(true)} className="rounded-sm text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {onMinutes ? "Already partway through? Set how far you are" : "Already partway through? Set your page"}
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

  const stopOptions = stopping ? (
    <p className="text-sm">
      Stopping at {onMinutes ? formatMinutes(page) : `page ${page}`} of {fmt(pages)}.{" "}
      <button type="button" onClick={toggleStopping} disabled={isSaving} className="underline underline-offset-4 text-muted-foreground hover:text-foreground">
        Keep reading
      </button>
    </p>
  ) : (
    <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
      {status === "STARTED" && (
        <button type="button" onClick={() => move("pause")} disabled={isSaving} className="underline underline-offset-4 hover:text-foreground">
          Pause this book
        </button>
      )}
      <button type="button" onClick={toggleStopping} disabled={isSaving} className="underline underline-offset-4 hover:text-foreground">
        I&apos;m not going to finish it
      </button>
    </p>
  )

  // Shown once there's more than the current read to look back on.
  const history = (reads ?? []).slice().reverse()
  const showHistory = history.length > 1 || (history.length === 1 && status === "NOT_STARTED")
  const readRange = (start: string | null, end: string | null) =>
    start && end ? `${formatDay(start)} – ${formatDay(end)}`
      : start ? `Started ${formatDay(start)}`
      : end ? formatDay(end)
      : "No dates"
  const readHistory = showHistory && (
    <section aria-labelledby="read-history">
      <h3 id="read-history" className="text-sm font-medium">Reading history</h3>
      <ol className="mt-2 flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {history.map((read) => (
          <li key={read.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {read.status === "COMPLETED" ? "Finished"
                  : read.status === "DNF" ? `Did not finish${read.stoppedAtMinute !== null ? ` · ${formatMinutes(read.stoppedAtMinute)}` : read.stoppedAtPage !== null ? ` · page ${read.stoppedAtPage}` : ""}`
                  : read.status === "PAUSED" ? "Paused"
                  : "Reading now"}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">{readRange(read.startedAt, read.finishedAt)}</p>
            </div>
            {read.rating ? <StarRating value={read.rating} readOnly size={14} label="Rating" className="shrink-0" /> : null}
          </li>
        ))}
      </ol>
    </section>
  )

  const ratingAndReview = (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Rating <span className="font-normal text-muted-foreground">· optional</span></span>
        <StarRating value={rating} onChange={setRating} disabled={isSaving} label="Your rating" />
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
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
        />
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={reviewSpoiler} onChange={(e) => setReviewSpoiler(e.target.checked)} disabled={isSaving} style={{ accentColor: accent }} className="size-4" />
            Contains spoilers
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={reviewPrivate} onChange={(e) => setReviewPrivate(e.target.checked)} disabled={isSaving} style={{ accentColor: accent }} className="size-4" />
            Only me
          </label>
        </div>
      </div>
      <ReaderTagsEditor value={tags} onChange={setTags} disabled={isSaving} accent={accent} />
    </div>
  )

  // What other readers said about the book, for anyone still reading it.
  const otherReaders = !isClosed && !finished && !stopping && workTags && workTags.readers > 0 && (
    <section aria-label="What readers say" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">What readers say</h3>
      <WorkTagsSummary tags={workTags} />
    </section>
  )

  const body = (
    <div className="w-full px-6 self-start flex flex-col md:flex-row gap-6 md:gap-10">
      <div className="flex md:flex-col gap-4 md:gap-5 md:w-44 shrink-0">
        <BookCover book={book} variant="thumb" sizes="(min-width: 768px) 176px, 72px" className="w-[72px] md:w-full shrink-0 self-start shadow-sm" />
        <div className="min-w-0">
          <p className="text-lg md:text-xl font-bold leading-snug break-words">
            {pageHref ? <Link href={pageHref} onClick={close} className="rounded-sm hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{book.title}</Link> : book.title}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground"><AuthorLink author={book.author} onNavigate={close} /></p>
          {/* Where the book is and who can see it, then what you can do with it. */}
          {(meta || isPrivate) && (
            <div className="mt-2 flex flex-col items-start gap-2">
              {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
              {isPrivate && status !== "NOT_INTERESTED" && <PrivateBadge />}
            </div>
          )}
          {/* Actions on the book, so they sit with the book rather than among the progress controls. */}
          <div className="mt-3 flex flex-col items-start">
            <button type="button" onClick={sendToFriend} disabled={isSaving} className={bookActionClass}>
              <Send size={14} aria-hidden />Send to a friend
            </button>
            {/* Will not read is private already. */}
            {status !== "NOT_INTERESTED" && (
              <button type="button" onClick={togglePrivate} disabled={isSaving} className={bookActionClass}>
                {isPrivate ? <><Unlock size={14} aria-hidden />Share on profile</> : <><Lock size={14} aria-hidden />Make private</>}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-8">
        {/* Coming back to a book (or starting the next in a series): the recap offer comes first. */}
        {(isActive || status === "NOT_STARTED") && !finished && !stopping && (
          <CatchMeUp bookId={book.id} accent={accent} accentInk={accentInk} />
        )}
        {status === "NOT_STARTED" && startControl}
        {isActive && progressControl}
        {isActive && !stopping && finishedSwitch}
        {isActive && !finished && stopOptions}
        {(isClosed || finished || stopping) && ratingAndReview}
        {otherReaders}
        {readHistory}
        <BuddyReadEntry book={book} onNavigate={close} />
      </div>
    </div>
  )

  const primaryLabel = status === "NOT_STARTED" ? (onMinutes ? "Start listening" : "Start reading")
    : isClosed ? "Save"
    : finished ? "Mark as finished"
    : stopping ? "Mark as did not finish"
    : status === "PAUSED" ? (onMinutes ? "Resume listening" : "Resume reading")
    : "Save progress"

  // A finished or abandoned book is mostly opened to look; only offer Save once there's something to save.
  const showPrimary = status !== "NOT_INTERESTED" && (!isClosed || hasChanges)

  const footer = (
    <div className="w-full p-6 flex flex-wrap items-center justify-end gap-3">
      {isClosed && (
        <div className="flex flex-wrap gap-3 mr-auto">
          <Button onClick={() => move("restart")} variant="outline" className="rounded-md" disabled={isSaving}>Read again</Button>
          {status === "DNF" && (
            <Button onClick={() => move("wantToRead")} variant="outline" className="rounded-md" disabled={isSaving}>Move to Want to read</Button>
          )}
        </div>
      )}
      {status === "NOT_INTERESTED" && (
        <Button onClick={() => move("wantToRead")} variant="outline" className="rounded-md mr-auto" disabled={isSaving}>Move to Want to read</Button>
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
      title={status === "NOT_STARTED" ? (onMinutes ? "Start listening" : "Start reading")
        : status === "COMPLETED" ? "Rating and review"
        : status === "DNF" ? "Did not finish"
        : status === "PAUSED" ? "Paused"
        : status === "NOT_INTERESTED" ? "Will not read"
        : "Update progress"}
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
