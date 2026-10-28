"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import { Bookmark } from 'lucide-react'
import BookCover from '../cards/BookCover'
import { SeeAllLink, ShelfSection } from '../books/shelf'
import useShelfPreview from '@/app/hooks/useShelfPreview'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import { discoverBookOf } from '@/lib/openLibrary'
import { Status } from '@/lib/bookStatus'

interface FavouritesRowProps {
  // Newest first.
  books: Book[]
  // Every favourite: /favourites for your own, /u/<them>/favourites for someone else's.
  href: string
  // Someone else's: a cover opens the book's details instead of your progress.
  readOnly?: boolean
  // Your own, with none yet: say how to add them instead of showing nothing.
  hintWhenEmpty?: boolean
  // Beside Books in common (ProfileShowcase): four covers from lg up, where it gets half the width.
  half?: boolean
}

// Two more columns than the shelf grid at each width (4 on a phone up to 8), so favourites read as a
// showcase of small covers rather than another shelf.
const favouritesGridClass = "grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-x-3 sm:gap-x-4 gap-y-4"
// The same, but four from lg up, in half the width beside Books in common.
const favouritesHalfGridClass = "grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 gap-x-3 sm:gap-x-4 gap-y-4"

// One favourite: the cover and its title, nothing else. Opens the book as a shelf card would.
const FavouriteTile: FC<{ book: Book, readOnly: boolean }> = ({ book, readOnly }) => {
  const bookUpdateModal = useBookUpdateModal()
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  const open = () => {
    if (readOnly) return openDetails(discoverBookOf(book))
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, book.status === Status.COMPLETED)
    bookUpdateModal.onOpen(book.id)
  }
  return (
    <button type="button" onClick={open} aria-label={`${book.title} by ${book.author}`}
      className="group flex min-w-0 flex-col gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <BookCover book={book} variant="thumb" sizes="(min-width: 1280px) 120px, (min-width: 640px) 15vw, 22vw"
        className="w-full shadow-sm transition md:group-hover:-translate-y-0.5 md:group-hover:opacity-90" />
      <span className="line-clamp-2 text-xs font-medium leading-snug">{book.title}</span>
    </button>
  )
}

// The books that say most about a reader, in one row of small covers near the top of their profile, then
// "See all".
const FavouritesRow: FC<FavouritesRowProps> = ({ books, href, readOnly = false, hintWhenEmpty = false, half = false }) => {
  // The shelf grid's columns plus two, to match favouritesGridClass at each width; four in half a wide screen.
  const preview = useShelfPreview()
  const columns = half && preview >= 10 ? 4 : preview / 2 + 2
  if (books.length === 0) {
    if (!hintWhenEmpty) return null
    return (
      <p className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Bookmark size={15} aria-hidden className="shrink-0" />
        Tap the bookmark on a cover to add a favourite here.
      </p>
    )
  }
  return (
    <div className={half ? undefined : "mb-12"}>
      <ShelfSection id="profile-favourites" title="Favourites" count={books.length}
        action={books.length > columns ? <SeeAllLink href={href} /> : undefined}>
        <div className={half ? favouritesHalfGridClass : favouritesGridClass}>
          {books.slice(0, columns).map((book) => <FavouriteTile key={book.id} book={book} readOnly={readOnly} />)}
        </div>
      </ShelfSection>
    </div>
  )
}

export default FavouritesRow
