import { FC, ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { Status } from '@/lib/bookStatus'

const time = (date: Date | string | null) => (date ? new Date(date).getTime() : 0)
const normalize = (s: string) => s.trim().toLowerCase()

export function groupShelf(books: Book[]) {
  return {
    reading: books.filter((b) => b.status === Status.STARTED)
      .sort((a, b) => time(b.startedAt) - time(a.startedAt)),
    wantToRead: books.filter((b) => b.status === Status.NOT_STARTED)
      .sort((a, b) => time(b.createdAt) - time(a.createdAt)),
    finished: books.filter((b) => b.status === Status.COMPLETED)
      .sort((a, b) => time(b.completedAt) - time(a.completedAt)),
    paused: books.filter((b) => b.status === Status.PAUSED)
      .sort((a, b) => time(b.stoppedAt) - time(a.stoppedAt)),
    didNotFinish: books.filter((b) => b.status === Status.DNF)
      .sort((a, b) => time(b.stoppedAt) - time(a.stoppedAt)),
    notInterested: books.filter((b) => b.status === Status.NOT_INTERESTED)
      .sort((a, b) => time(b.createdAt) - time(a.createdAt)),
  }
}

// True when a currently-reading book has been finished before: either this
// same entry was restarted (timesRead survives a restart), or an earlier,
// separate entry for the same title/author sits in the finished shelf.
export function isRereading(book: Book, finished: Book[]) {
  if (book.timesRead > 0) return true
  return finished.some((f) => f.id !== book.id
    && normalize(f.title) === normalize(book.title)
    && normalize(f.author) === normalize(book.author))
}

// Two columns when the count would leave an orphan in a row of three.
export function readingGridCols(count: number) {
  return count % 3 === 0 || count > 4 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"
}

// Covers each shelf shows before "See all": two rows on a wide screen. Enough to recognise the shelf, and
// short enough that the series tracker, reviews and lists below are a scroll or two away.
export const SHELF_PREVIEW = 12

export const coverGridClass = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8"

// "See all ›" in a capped section's header, so the whole list is a tap away without scrolling past the
// preview (the button under the preview, with the count, stays for whoever has). No count here: it's
// already beside the heading. A link to a shelf's page, or a button that opens the rest in place.
export const SeeAllLink: FC<{ href?: string; onClick?: () => void }> = ({ href, onClick }) => {
  const className = "inline-flex shrink-0 items-center gap-0.5 rounded-md text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  const label = <>See all<ChevronRight size={15} aria-hidden /></>
  return href
    ? <Link href={href} className={className}>{label}</Link>
    : <button type="button" onClick={onClick} className={className}>{label}</button>
}

// A titled section of a profile or shelf page. Given `collapsed` and `onToggle` (your own profile, from
// useCollapsedSections) the heading folds the body away and the chevron says so; the count stays, so a
// folded shelf still says what's in it. The action ("See all", select all) belongs to the body and goes
// with it.
export const ShelfSection: FC<{ id: string; title: string; count: number; action?: ReactNode; collapsed?: boolean; onToggle?: () => void; children: ReactNode }> = ({ id, title, count, action, collapsed, onToggle, children }) => {
  const collapsible = collapsed !== undefined && !!onToggle
  const heading = (
    <>
      {title}
      <span className="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
    </>
  )
  return (
    <section aria-labelledby={id} className="mt-12 first:mt-0">
      <div className={cn("flex items-center justify-between gap-4 min-h-10", !collapsed && "mb-5")}>
        <h2 id={id} className="flex items-baseline gap-2 text-lg font-semibold">
          {collapsible ? (
            <button type="button" aria-expanded={!collapsed} aria-controls={`${id}-body`} onClick={onToggle}
              className="group -ml-1 inline-flex items-baseline gap-2 rounded-md px-1 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {heading}
              <ChevronDown size={16} aria-hidden className={cn("self-center text-muted-foreground transition-transform group-hover:text-foreground", collapsed && "-rotate-90")} />
            </button>
          ) : heading}
        </h2>
        {!collapsed && action}
      </div>
      <div id={`${id}-body`} hidden={collapsed}>{!collapsed && children}</div>
    </section>
  )
}
