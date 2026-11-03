"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import { Bookmark } from 'lucide-react'
import BookCover from '../cards/BookCover'
import { FavouritesSkeleton } from './ProfileSkeleton'
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

// Three across at every width: the top three of the ranking, large enough to read as a showcase. Capped on a wide
// column (lg:max-w-2xl), where three across the full width would make each cover poster-sized.
const favouritesGridClass = "grid grid-cols-3 gap-x-3 sm:gap-x-4 gap-y-4 lg:max-w-2xl"

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
  // keyboard focus, in the page's text colour, and a tooltip above it with the title. The label names the book
  // for screen readers.
  return (
    <button type="button" onClick={open} aria-label={`${book.title} by ${book.author}`}
      className="group relative block min-w-0 rounded-md text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hover:ring-2 md:hover:ring-foreground md:hover:ring-offset-2 md:hover:ring-offset-background">
      <BookCover book={book} variant="thumb" sizes="(min-width: 1280px) 220px, (min-width: 640px) 25vw, 30vw" className="w-full shadow-sm" />
      {/* Over the cover's top edge; hover and keyboard focus only, as a touch screen has no hover. */}
      <span role="tooltip" aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-max max-w-[15rem] -translate-x-1/2 translate-y-1 rounded-lg bg-foreground px-3 py-2 text-center opacity-0 shadow-lg transition duration-150 md:block md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-visible:translate-y-0 md:group-focus-visible:opacity-100">
        <span className="block text-sm font-semibold leading-snug text-background">{book.title}</span>
        <span aria-hidden className="absolute left-1/2 top-full size-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-foreground" />
      </span>
    </button>
  )
}

// The books that say most about a reader: their top three, in one row near the top of their profile, then "See
// all" (the Favourites page, where they're ranked).
const FavouritesRow: FC<FavouritesRowProps> = ({ books, href, readOnly = false, hintWhenEmpty = false, half = false }) => {
  // Your top three (the ranking on the Favourites page), in one row of three covers.
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
        <div className={favouritesGridClass}>
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
