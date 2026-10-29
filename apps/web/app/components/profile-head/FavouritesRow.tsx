"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import { Bookmark } from 'lucide-react'
import BookCover from '../cards/BookCover'
import { Skeleton } from '../ui/skeleton'
import { SeeAllLink, ShelfSection } from '../books/shelf'
import useCollapsedSections from '@/app/hooks/useCollapsedSections'
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
  // Your own, with none yet: say how to add them instead of showing nothing.
  hintWhenEmpty?: boolean
  // Beside Books in common (ProfileShowcase): no bottom margin, as it sits in a grid.
  half?: boolean
  // Your own profile: the section folds up from its heading, and stays folded.
  collapsible?: boolean
}

// Four across at every width: the top four of the ranking, large enough to read as a showcase.
const favouritesGridClass = "grid grid-cols-4 gap-x-3 sm:gap-x-4 gap-y-4"

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

// The books that say most about a reader: their top four, in one row near the top of their profile, then "See
// all" (the Favourites page, where they're ranked).
const FavouritesRow: FC<FavouritesRowProps> = ({ books, href, readOnly = false, hintWhenEmpty = false, half = false, collapsible = false }) => {
  const collapse = useCollapsedSections()
  // Your top four (the ranking on the Favourites page), in one row of four covers.
  const columns = TOP_FAVOURITES
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
      <ShelfSection id="profile-favourites" title="Favourites" count={books.length} {...(collapsible ? collapse("profile-favourites") : {})}
        action={books.length > columns ? <SeeAllLink href={href} /> : undefined}>
        <div className={favouritesGridClass}>
          {books.slice(0, columns).map((book) => <FavouriteTile key={book.id} book={book} readOnly={readOnly} />)}
        </div>
      </ShelfSection>
    </div>
  )
}

// Your own favourites while the shelf they're drawn from loads: one row of small covers, or just the
// heading if you've folded the section.
export const FavouritesRowSkeleton: FC = () => {
  const { collapsed } = useCollapsedSections()("profile-favourites")
  return (
    <div className="mb-12" aria-busy="true" aria-label="Loading your favourites">
      <div className={collapsed ? "flex min-h-10 items-center" : "mb-5 flex min-h-10 items-center"}><Skeleton className="h-6 w-32" /></div>
      {!collapsed && (
        <div className={favouritesGridClass}>
          {Array.from({ length: TOP_FAVOURITES }, (_, i) => <Skeleton key={i} className="aspect-[2/3]" />)}
        </div>
      )}
    </div>
  )
}

export default FavouritesRow
