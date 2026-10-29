"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import type { Book } from '@prisma/client'
import { ChevronDown, ChevronRight, Pencil, Users, Repeat2 } from 'lucide-react'
import { chapterAt, formatEntry, formatPosition, progressWhole } from '@/lib/progress'
import { cn } from '@/lib/utils'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { bookHref } from '@/lib/workKey'
import { discoverBookOf } from '@/lib/openLibrary'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import useUser from '@/app/hooks/useUser'
import { isRereading } from '../books/shelf'
import BookCover from '../cards/BookCover'
import UpdateSheet from './UpdateSheet'

interface ContinueReadingProps {
  // Currently reading, most recently started first.
  books: Book[]
  // The finished shelf, to tell a reread (an earlier copy finished) from a first read.
  finished?: Book[]
  accentColour?: string | null
  // Someone else's books: no Update, and a tap opens the book's details.
  readOnly?: boolean
  // Someone else's profile on a phone: one line ("Piranesi · 62%" with a bar, and "+2 more") that opens the
  // cards, so their favourites stay near the top of the screen.
  oneLineOnPhone?: boolean
  // Someone else's profile: the reading circles you share with them (lib/sharedCircles.ts), keyed by their
  // book. Your own come from /api/buddy-reads.
  shared?: { bookId: string; circleId: string; at: number | null }[]
}

// Books shown before "Show N more": five rows on a wide screen; on a phone two, so what's next stays within a
// scroll.
const SHOWN_WIDE = 5
const SHOWN_PHONE = 2

// "Page 248 of 590 · 42%", "3h 23m of 9h 1m · 37%": where you are, and always your own percentage, so a
// circle's percentage beside it can't be read as yours.
const whereAt = (book: Book) => {
  // Chapters and Kindle locations say the place the way it was logged: "Ch 9 of 14 · 64%".
  const where = formatEntry(book) ?? formatPosition(book, { percent: false })
  const pct = `${progressWhole(book)}%`
  return where === "No page count" ? pct : `${where} · ${pct}`
}

// A reading circle you're in, as /api/buddy-reads returns it: enough to find the shelf book it's for and say
// where the rest of the circle is.
interface CircleRow {
  id: string
  title: string
  author: string
  status: 'ACTIVE' | 'FINISHED' | 'ARCHIVED'
  members: { userId: string; progress: number }[]
  myProgress: number
}
const norm = (s: string) => s.trim().toLowerCase()

// Where the rest of a circle is: the middle of the other members' progress.
const circleAt = (circle: CircleRow, me: string | undefined) => {
  const others = circle.members.filter((m) => m.userId !== me).map((m) => m.progress).sort((a, b) => a - b)
  if (others.length === 0) return null
  return others[Math.floor((others.length - 1) / 2)]
}

type Size = 'large' | 'card' | 'row'

// A reading circle beside a card: its page, and where the rest of it is (`at`, a percent), said in this
// book's chapters when it has them ("Ch 8"), as members' editions differ in pages but share their chapters.
interface CircleMark { id: string; at: number | null; label: string }
const markOf = (book: Book, id: string, at: number | null): CircleMark => ({
  id, at, label: at == null ? '' : book.chapters ? `at Ch ${chapterAt(at, book.chapters)}` : `${Math.round(at)}%`,
})

const ContinueCard: FC<{ book: Book; accent: string; readOnly: boolean; size: Size; circle?: CircleMark; reread?: boolean; className?: string; onUpdate: (book: Book, card: HTMLElement) => void }> = ({ book, accent, readOnly, size, circle, reread = false, className, onUpdate }) => {
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  const progress = progressWhole(book)
  const position = whereAt(book)
  const href = bookHref({ workKey: book.workKey, title: book.title })
  const update = (e: React.MouseEvent<HTMLElement>) => onUpdate(book, e.currentTarget.closest('li')!)
  const details = () => openDetails(discoverBookOf(book))
  // Where you are, the bar, and (on your own books) a quiet Update chip at the end of the line.
  const place = (
    <>
      <span className="flex min-h-7 items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
        {/* Where the circle is goes on this line too, not beside the bar, where it made the card taller. */}
        <span className="min-w-0 truncate" title={circle?.at != null ? `${position} · circle ${circle.label}` : undefined}>{position}{circle?.at != null && <> · circle {circle.label}</>}</span>
        {!readOnly && (
          // Lifted 4px off the bar (equal and opposite margins, so the row keeps its height).
          <span className="-mt-1 mb-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 font-medium text-foreground transition group-hover/update:bg-neutral-200 dark:bg-neutral-800 dark:group-hover/update:bg-neutral-700">
            <Pencil size={12} aria-hidden />Update<span className="sr-only"> progress for {book.title}</span>
          </span>
        )}
      </span>
      <span className="mt-1.5 flex items-center gap-2">
        <span role="progressbar" aria-label={`${book.title} progress`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}
          className="relative block h-1.5 flex-1 rounded-full bg-neutral-200 transition group-hover/update:brightness-125 dark:bg-neutral-700">
          <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, background: accent }} />
          {circle?.at != null && <span aria-hidden title={`Circle ${circle.label}`} className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground" style={{ left: `${circle.at}%` }} />}
        </span>
      </span>
    </>
  )
  const coverWidth = size === 'large' ? 'w-20' : size === 'card' ? 'w-16' : 'w-12'
  const title = href && !readOnly
    ? <Link href={href} className="hover:underline underline-offset-2">{book.title}</Link>
    : <button type="button" onClick={details} className="text-left hover:underline underline-offset-2">{book.title}</button>
  return (
    <li className={cn("flex items-center gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3", size === 'row' && "py-2.5", className)}>
      <button type="button" onClick={details} aria-label={`About ${book.title}`} className={cn("shrink-0 self-start rounded-md transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", coverWidth)}>
        <BookCover book={book} variant="thumb" sizes="80px" className="w-full shadow-sm" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium leading-snug" title={book.title}>{title}</p>
        {/* A circle and a reread ride on the author line, after the name, rather than a row of their own, so
            every card in the list keeps the same height. The name gives way (truncates) before they do. */}
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate">{book.author}</span>
          {circle && (
            <Link href={`/circles/${circle.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-foreground/80 hover:text-foreground hover:underline underline-offset-2">
              <span aria-hidden className="text-muted-foreground">·</span><Users size={12} aria-hidden />Circle
            </Link>
          )}
          {reread && (
            <span title={readOnly ? "They've read this book before" : "You've read this book before"}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground/80">
              <span aria-hidden className="text-muted-foreground">·</span><Repeat2 size={12} aria-hidden />Reread
            </span>
          )}
        </p>
        {readOnly ? <div className="mt-1">{place}</div> : (
          // The place and its bar are the Update button (a 44px row), so the bar keeps the card's full width.
          <button type="button" onClick={update}
            className="group/update mt-1 block min-h-11 w-full rounded-md py-1 text-left transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            {place}
          </button>
        )}
      </div>
    </li>
  )
}

// What you're reading, at the top of your profile in bands, each with a labelled Update. One book gets a large
// card, two sit side by side, and three or more are rows, so a third or fourth book is never hidden. A book
// you're reading with a circle comes first, saying where the circle is. Someone else's profile shows the same
// without Update (and, on a phone, as one line that opens them); circles are yours only for now.
const ContinueReading: FC<ContinueReadingProps> = ({ books, finished = [], accentColour, readOnly = false, oneLineOnPhone = false, shared = [] }) => {
  const [all, setAll] = useState(false)
  // The Update sheet, kept here rather than in a card: finishing a book takes its card off the list, and the
  // sheet still has a rating and what's next to show. From sm up it sits under the card that opened it.
  const [sheet, setSheet] = useState<{ book: Book; top: number } | null>(null)
  const openSheet = (book: Book, card: HTMLElement) => setSheet({ book, top: card.offsetTop + card.offsetHeight })
  const [open, setOpen] = useState(false)
  const { data: circles } = useSWR<{ buddyReads: CircleRow[] }>(readOnly ? null : '/api/buddy-reads', fetcher, swrOptions)
  const { user } = useUser()
  const accent = accentColour || '#F13C3C'
  if (books.length === 0) {
    return oneLineOnPhone
      ? <p className="text-sm text-muted-foreground">Not reading anything right now.</p>
      : null
  }

  // Your circles are matched to shelf books by title and author, as the circle keeps its own copy of both;
  // on someone else's profile, by their book.
  const circleOf = (book: Book) => {
    if (readOnly) {
      const s = shared.find((c) => c.bookId === book.id)
      return s ? markOf(book, s.circleId, s.at) : undefined
    }
    const c = circles?.buddyReads.find((r) => r.status === 'ACTIVE' && norm(r.title) === norm(book.title) && norm(r.author) === norm(book.author))
    return c ? markOf(book, c.id, circleAt(c, user?.id)) : undefined
  }
  const ordered = [...books.filter((b) => circleOf(b)), ...books.filter((b) => !circleOf(b))]
  const size: Size = ordered.length === 1 ? 'large' : ordered.length === 2 ? 'card' : 'row'
  const hidden = ordered.length - SHOWN_WIDE

  const cards = (
    // grid-cols-1 (minmax(0, 1fr)), so a long position line truncates instead of widening the column past the screen.
    <ul className={cn("grid grid-cols-1 gap-3", size === 'card' && "sm:grid-cols-2")}>
      {ordered.map((book, i) => (
        <ContinueCard key={book.id} book={book} accent={accent} readOnly={readOnly} size={size} circle={circleOf(book)} reread={isRereading(book, finished)} onUpdate={openSheet}
          className={cn(!all && i >= SHOWN_PHONE && "max-sm:hidden", !all && i >= SHOWN_WIDE && "sm:hidden")} />
      ))}
    </ul>
  )
  const more = !all && ordered.length > SHOWN_PHONE && (
    <button type="button" onClick={() => setAll(true)} className={cn("mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground", hidden <= 0 && "sm:hidden")}>
      Show <span className="sm:hidden">{ordered.length - SHOWN_PHONE}</span><span className="hidden sm:inline">{hidden}</span> more<ChevronDown size={15} aria-hidden />
    </button>
  )

  if (!oneLineOnPhone) {
    return (
      <div className="relative">
        {cards}{more}
        {sheet && <UpdateSheet book={sheet.book} top={sheet.top} onClose={() => setSheet(null)} />}
      </div>
    )
  }
  const first = ordered[0]
  const firstCircle = circleOf(first)
  return (
    <>
      <div className="flex items-center gap-2 sm:hidden">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-baseline gap-1.5 text-sm">
            <span className="truncate font-medium">{first.title}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">· {progressWhole(first)}%{firstCircle?.at != null && <> · circle {firstCircle.label}</>}</span>
          </span>
          <span className="relative mt-1.5 block h-1 rounded-full bg-neutral-200 dark:bg-neutral-700" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${progressWhole(first)}%`, background: accent }} />
            {firstCircle?.at != null && <span className="absolute -top-1 h-3 w-0.5 rounded-full bg-foreground" style={{ left: `${firstCircle.at}%` }} />}
          </span>
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {ordered.length > 1 ? `+${ordered.length - 1} more` : open ? "Hide" : "Details"}
          <ChevronRight size={14} aria-hidden className={cn("transition-transform", open && "rotate-90")} />
        </button>
      </div>
      <div className={cn(open ? "max-sm:mt-3" : "max-sm:hidden")}>{cards}{more}</div>
    </>
  )
}

export default ContinueReading
