"use client"
import { FC, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import type { Book } from '@prisma/client'
import { ChevronDown, ChevronRight, ChevronUp, MoreHorizontal, Pencil, Users, Repeat2 } from 'lucide-react'
import { chapterAt, formatEntry, formatPosition, progressWhole } from '@/lib/progress'
import { cn } from '@/lib/utils'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { bookHref } from '@/lib/workKey'
import { discoverBookOf } from '@/lib/openLibrary'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import useUser from '@/app/hooks/useUser'
import { isRereading } from '../books/shelf'
import AuthorLink from '../AuthorLink'
import BookCover from '../cards/BookCover'
import FavouriteButton from '../cards/FavouriteButton'
import ShelfMenuItems from '../books/ShelfMenuItems'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
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

// Books shown before "Show N more": three rows on a wide screen; on a phone two, so what's next stays within a
// scroll.
const SHOWN_WIDE = 3
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

const ContinueCard: FC<{ book: Book; accent: string; readOnly: boolean; size: Size; circle?: CircleMark; reread?: boolean; bare?: boolean; className?: string; onUpdate: (book: Book, card: HTMLElement, startAt?: 'log' | 'rate') => void }> = ({ book, accent, readOnly, size, circle, reread = false, bare = false, className, onUpdate }) => {
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  const progress = progressWhole(book)
  const position = whereAt(book)
  const href = bookHref({ workKey: book.workKey, title: book.title })
  const card = useRef<HTMLLIElement>(null)
  const update = (e: React.MouseEvent<HTMLElement>) => onUpdate(book, e.currentTarget.closest('li')!)
  const details = () => openDetails(discoverBookOf(book))
  // Where you are, the bar, and (on your own books) a quiet Update chip at the end of the line.
  const place = (
    <>
      <span className="flex min-h-7 items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
        <span className="min-w-0 truncate">{position}</span>
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
          {/* The fill slides in from the left (transform, not width), clipped by its own rounded track so the circle's
              mark can still overhang the bar. */}
          <span className="absolute inset-0 overflow-hidden rounded-full">
            <span className="block h-full rounded-full transition-transform duration-500 ease-out" style={{ transform: `translateX(${progress - 100}%)`, background: accent }} />
          </span>
          {circle?.at != null && <span aria-hidden title={`Circle ${circle.label}`} className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground" style={{ left: `${circle.at}%` }} />}
        </span>
      </span>
    </>
  )
  // 64px is close to 2:3 beside the usual 96px of text; the one large card is tall enough for an 80px cover. A bare
  // card (cover, title and author only) is given the height of a 48px cover.
  const coverWidth = bare ? 'w-12' : size === 'large' ? 'w-20' : 'w-16'
  const marks = (
    <>
      {circle && (
        // z-10, so its 40px tap area (the after:) wins over the Update row just below it.
        <Link href={`/circles/${circle.id}`} aria-label={circle.label ? `Your reading circle for ${book.title}, ${circle.label}` : `Your reading circle for ${book.title}`}
          className="relative z-10 inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-neutral-300 pl-2 pr-1.5 text-xs font-medium text-foreground transition after:absolute after:-inset-x-1 after:-inset-y-2 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Users size={12} aria-hidden />{circle.label.replace(/^at /, '') || 'Circle'}<ChevronRight size={12} aria-hidden className="text-muted-foreground" />
        </Link>
      )}
      {reread && (
        <span title={readOnly ? "They've read this book before" : "You've read this book before"} className="inline-flex shrink-0 items-center gap-1 text-xs">
          {(!bare || circle) && <span aria-hidden>·</span>}<Repeat2 size={12} aria-hidden />Reread
        </span>
      )}
    </>
  )
  const title = href && !readOnly
    ? <Link href={href} className="hover:underline underline-offset-2">{book.title}</Link>
    : <button type="button" onClick={details} className="text-left hover:underline underline-offset-2">{book.title}</button>
  return (
    <li ref={card} className={cn("relative flex items-center gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3", !bare && size === 'row' && "py-2", bare ? "min-h-24" : size === 'large' && "min-h-36", className)}>
      {/* The bookmark floats in the corner rather than taking a column, so the bar runs the card's full width. */}
      {/* The cover runs the card's full height: its slot stretches with the card and the cover fills it, cropped
          like a photo, rather than sitting at the top with a gap under it. Widths keep the slot close to 2:3. */}
      <button type="button" onClick={details} aria-label={`About ${book.title}`} className={cn("relative shrink-0 self-stretch rounded-md transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", coverWidth)}>
        <BookCover book={book} variant="thumb" sizes="80px" className="absolute inset-0 aspect-auto h-full shadow-sm" />
      </button>
      {/* A bare tile's title and author sit at the top, with its marks on their own line under them (there's
          room, without the progress). On a full card they're centred, the marks riding on the author line. */}
      <div className={cn("min-w-0 flex-1", bare && "self-start")}>
        <p className={cn("line-clamp-2 font-medium leading-snug", !readOnly && "pr-[4.5rem]")} title={book.title}>{title}</p>
        {/* A circle and a reread ride on the author line, after the name, rather than a row of their own; the
            line is 28px on every card, so the circle's chip fits and the cards stay one height. The name gives
            way (truncates) before they do. The circle is the one control here, an outlined chip saying where the
            circle is, a rank below the filled Update; Reread is plain text, as it does nothing. */}
        {bare ? (
          <>
            <p className="truncate text-sm text-muted-foreground"><AuthorLink author={book.author} /></p>
            {(circle || reread) && <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">{marks}</p>}
          </>
        ) : (
          <p className={cn("flex h-7 min-w-0 items-center gap-1.5 text-sm text-muted-foreground", !readOnly && "pr-[4.5rem]")}>
            <AuthorLink author={book.author} className="truncate" />{marks}
          </p>
        )}
        {bare ? null : readOnly ? <div className="mt-1">{place}</div> : (
          // The place and its bar are the Update button (a 44px row), so the bar keeps the card's full width.
          <button type="button" onClick={update}
            className="group/update mt-1 block min-h-11 w-full rounded-md py-1 text-left transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            {place}
          </button>
        )}
      </div>
      {!readOnly && (
        // Pause, Did not finish, Want to read and Make private, as on every other shelf card, so taking a book
        // off Currently reading never depends on a toast's Undo.
        <div className="absolute right-2 top-2 flex items-center">
          <FavouriteButton bookId={book.id} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`More actions for ${book.title}`} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-neutral-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-neutral-800">
                <MoreHorizontal size={16} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* Opens the Update sheet on its rating step, so a finish from here is rated and followed by what's next. */}
              <DropdownMenuItem onSelect={() => onUpdate(book, card.current!, 'rate')}>Finished</DropdownMenuItem>
              <ShelfMenuItems book={book} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  )
}

// What you're reading, at the top of your profile in bands, each with a labelled Update. One book gets a large
// card, two sit side by side, and three or more are rows, and past three the rest wait behind "Show more". A book
// you're reading with a circle comes first, saying where the circle is. Someone else's profile shows the same
// without Update; on a phone, as bare tiles (cover, title, author), the first with "Show all" for the rest.
// Circles shown are your own, or on someone else's page the ones you share with them.
const ContinueReading: FC<ContinueReadingProps> = ({ books, finished = [], accentColour, readOnly = false, oneLineOnPhone = false, shared = [] }) => {
  const [all, setAll] = useState(false)
  // The Update sheet, kept here rather than in a card: finishing a book takes its card off the list, and the
  // sheet still has a rating and what's next to show. From sm up it opens as a modal.
  const [sheet, setSheet] = useState<{ book: Book; startAt: 'log' | 'rate' } | null>(null)
  const openSheet = (book: Book, card: HTMLElement, startAt: 'log' | 'rate' = 'log') => setSheet({ book, startAt })
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
        <ContinueCard key={book.id} book={book} accent={accent} readOnly={readOnly} size={size} circle={circleOf(book)} reread={isRereading(book, finished)} bare={readOnly} onUpdate={openSheet}
          className={cn(!all && i >= SHOWN_PHONE && "max-sm:hidden", !all && i >= SHOWN_WIDE && "sm:hidden")} />
      ))}
    </ul>
  )
  // Show more, then Show less to fold them away again. From sm up it's only there when more than three are on
  // the go, as that's all a wide screen hides.
  const more = ordered.length > SHOWN_PHONE && (
    <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all} className={cn("mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground", hidden <= 0 && "sm:hidden")}>
      {all ? <>Show less<ChevronUp size={15} aria-hidden /></>
        : <>Show <span className="sm:hidden">{ordered.length - SHOWN_PHONE}</span><span className="hidden sm:inline">{hidden}</span> more<ChevronDown size={15} aria-hidden /></>}
    </button>
  )

  if (!oneLineOnPhone) {
    return (
      <div className="relative">
        {cards}{more}
        {sheet && <UpdateSheet book={sheet.book} startAt={sheet.startAt} onClose={() => setSheet(null)} />}
      </div>
    )
  }
  // On a phone, someone else's books are bare tiles: what they're reading, not how far. The first shows,
  // and "Show all" opens the rest.
  return (
    <>
      <div className="sm:hidden">
        <ul className="grid grid-cols-1 gap-3">
          {ordered.slice(0, open ? ordered.length : 1).map((book) => (
            <ContinueCard key={book.id} book={book} accent={accent} readOnly size="row" circle={circleOf(book)} reread={isRereading(book, finished)} bare onUpdate={openSheet} />
          ))}
        </ul>
        {ordered.length > 1 && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="mt-3 inline-flex h-8 items-center gap-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {open ? <>Show less<ChevronUp size={14} aria-hidden /></> : <>Show all<ChevronDown size={14} aria-hidden /></>}
          </button>
        )}
      </div>
      <div className="hidden sm:block">{cards}{more}</div>
    </>
  )
}

export default ContinueReading
