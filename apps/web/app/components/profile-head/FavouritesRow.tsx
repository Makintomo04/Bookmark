"use client"
import { FC } from 'react'
import type { Book } from '@prisma/client'
import { Bookmark } from 'lucide-react'
import BookCoverCard from '../cards/BookCoverCard'
import { SeeAllLink, ShelfSection, coverGridClass } from '../books/shelf'
import useShelfPreview from '@/app/hooks/useShelfPreview'

interface FavouritesRowProps {
  // Newest first.
  books: Book[]
  // Every favourite: /favourites for your own, /u/<them>/favourites for someone else's.
  href: string
  accentColour?: string | null
  // Someone else's: the covers open the book's details.
  readOnly?: boolean
  // Your own, with none yet: say how to add them instead of showing nothing.
  hintWhenEmpty?: boolean
}

// The books that say most about a reader, in one row near the top of their profile: as many covers as
// the shelf grid has columns on this screen (2 on a phone up to 6), then "See all".
const FavouritesRow: FC<FavouritesRowProps> = ({ books, href, accentColour, readOnly = false, hintWhenEmpty = false }) => {
  const columns = useShelfPreview() / 2
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
    <div className="mb-12">
      <ShelfSection id="profile-favourites" title="Favourites" count={books.length}
        action={books.length > columns ? <SeeAllLink href={href} /> : undefined}>
        <div className={coverGridClass}>
          {books.slice(0, columns).map((book) => <BookCoverCard key={book.id} book={book} accentColour={accentColour} readOnly={readOnly} />)}
        </div>
      </ShelfSection>
    </div>
  )
}

export default FavouritesRow
