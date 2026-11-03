"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import { Bookmark } from 'lucide-react'
import BookCover from '../cards/BookCover'
import { FavouritesSkeleton, favouritesSkeletonGridClass } from './ProfileSkeleton'
import { SeeAllLink, ShelfSection } from '../books/shelf'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import { discoverBookOf } from '@/lib/openLibrary'
import { Status } from '@/lib/bookStatus'
import { TOP_FAVOURITES } from '@/lib/favourites'

interface FavouritesRowProps {
  // Newest first.
  books: Book[]
  // Every favourite: /favourites for your own, /u/<them>/favourites for someone else's.
  href: string
  // Someone else's: a cover opens the book's details instead of your progress.
  readOnly?: boolean
  // Your own, with none yet: the heading and how to add one, where the row will be, instead of nothing.
  hintWhenEmpty?: boolean
  // Beside Books in common (ProfileShowcase): no bottom margin, as it sits in a grid.
  half?: boolean
}

// The top four of the ranking, four across at every width, so the fourth is never hidden behind a swipe. On a
// phone the covers come down to about 80px (66px on a 320px screen), the size of Continue reading's.
const favouritesRowClass = favouritesSkeletonGridClass

// One favourite: the cover, nothing else. Opens the book as a shelf card would.
const FavouriteTile: FC<{ book: Book, readOnly: boolean }> = ({ book, readOnly }) => {
  const bookUpdateModal = useBookUpdateModal()
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  const open = () => {
    if (readOnly) return openDetails(discoverBookOf(book))
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, book.status === Status.COMPLETED)
    bookUpdateModal.onOpen(book.id)
  }
  // Just the cover, as on the shelf in covers view (BookCoverCard's coversOnly): an outline just off it on hover or
  // keyboard focus, in the page's text colour, and the title over the foot of the cover. The label names the book
  // for screen readers.
  return (
    <button type="button" onClick={open} aria-label={`${book.title} by ${book.author}`}
      className="group relative block w-full min-w-0 rounded-md text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hover:ring-2 md:hover:ring-foreground md:hover:ring-offset-2 md:hover:ring-offset-background">
      <BookCover book={book} variant="thumb" sizes="(min-width: 1280px) 220px, 25vw" className="w-full shadow-sm" />
      {/* Inside the cover's bottom edge, on a fade so it reads over any art; hover and keyboard focus only, as a
          touch screen has no hover. */}
      <span aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 hidden rounded-b-md bg-gradient-to-t from-black/85 via-black/60 to-transparent px-2.5 pb-2.5 pt-8 opacity-0 transition duration-150 md:block md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-white">{book.title}</span>
      </span>
    </button>
  )
}

// The books that say most about a reader: their top four, in one row near the top of their profile, then "See
// all" (the Favourites page, where they're ranked).
const FavouritesRow: FC<FavouritesRowProps> = ({ books, href, readOnly = false, hintWhenEmpty = false, half = false }) => {
  // Your top four (the ranking on the Favourites page), in one row.
  const columns = TOP_FAVOURITES
  if (books.length === 0) {
    if (!hintWhenEmpty) return null
    // The heading without a count, so the line reads as this section's and not the next one's.
    return (
      <section aria-labelledby="profile-favourites" className={half ? undefined : "mb-12"}>
        <h2 id="profile-favourites" className="flex min-h-10 items-center text-lg font-semibold">Favourites</h2>
        <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
          <Bookmark size={16} aria-hidden className="mt-0.5 shrink-0" />
          Use the bookmark on any cover to add a favourite
        </p>
      </section>
    )
  }
  return (
    <div className={half ? undefined : "mb-12"}>
      <ShelfSection id="profile-favourites" title="Favourites" count={books.length}
        action={books.length > columns ? <SeeAllLink href={href} /> : undefined}>
        <div className={favouritesRowClass}>
          {books.slice(0, columns).map((book) => <FavouriteTile key={book.id} book={book} readOnly={readOnly} />)}
        </div>
      </ShelfSection>
    </div>
  )
}

// Your own favourites while the shelf they're drawn from loads: one row of small covers.
export const FavouritesRowSkeleton: FC = () => (
  <div className="mb-12" aria-busy="true" aria-label="Loading your favourites">
    <FavouritesSkeleton />
  </div>
)

export default FavouritesRow
