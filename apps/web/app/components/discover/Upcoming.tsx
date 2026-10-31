import { FC } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { formatReleaseDate } from '@bookmark/shared/releases'
import { upcomingBooks, type UpcomingBook } from '@/lib/upcoming'
import DiscoverBookCard from './DiscoverBookCard'

// Upcoming (BOO-7): books not out yet, soonest first, with authors and series the reader follows first.
// Under each card, the day it comes out and, for a followed one, why it's there.

// Two lines, so neither is cut short on a narrow card.
const When: FC<{ book: UpcomingBook }> = ({ book }) => (
  <div className="flex flex-col gap-0.5 min-w-0 text-[11px] text-muted-foreground">
    <p className="flex items-center gap-1.5 min-w-0">
      <CalendarDays size={12} aria-hidden className="shrink-0" />
      <time dateTime={book.releaseDate} className="truncate">{formatReleaseDate(book.releaseDate)}</time>
    </p>
    {book.followed && <p className="truncate">You follow this</p>}
  </div>
)

export const UpcomingGrid: FC<{ books: UpcomingBook[] }> = ({ books }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-5 gap-y-8">
    {books.map((book) => <DiscoverBookCard key={book.pageWorkId ?? book.workKey ?? book.title} book={book} context={<When book={book} />} />)}
  </div>
)

// Discover's row: the first few, and the way to the rest. Nothing at all when nothing's coming.
// Six: one row on a wide screen, two even rows of three on a tablet.
export const UPCOMING_ROW = 6

const UpcomingSection = async ({ viewerId, today }: { viewerId: string | null, today: string }) => {
  const books = await upcomingBooks(viewerId, { today, limit: UPCOMING_ROW + 1 })
  if (books.length === 0) return null
  return (
    <section aria-labelledby="upcoming-heading">
      <h2 id="upcoming-heading" className="text-xl font-bold">Upcoming</h2>
      <p className="mt-1 text-sm text-muted-foreground">Books on the way, with authors and series you follow first.</p>
      {/* Scrolls sideways on phones; a grid with room to spare. */}
      <div className="mt-4 -mx-4 px-4 flex sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-2">
        {books.slice(0, UPCOMING_ROW).map((book) => (
          <div key={book.pageWorkId ?? book.workKey ?? book.title} className="w-36 shrink-0 sm:w-auto snap-start">
            <DiscoverBookCard book={book} context={<When book={book} />} />
          </div>
        ))}
      </div>
      {books.length > UPCOMING_ROW && (
        <Link href="/discover/upcoming" className="mt-4 inline-flex items-center gap-2 text-sm font-medium rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          See everything upcoming <ArrowRight size={16} aria-hidden />
        </Link>
      )}
    </section>
  )
}

export default UpcomingSection
