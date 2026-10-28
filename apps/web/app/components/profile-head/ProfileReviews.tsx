"use client"
import { FC, useState } from 'react'
import BookCover from '../cards/BookCover'
import StarRating from '../StarRating'
import ReviewText from '../feed/ReviewText'
import { SeeAllLink, ShelfSection } from '../books/shelf'
import { pillClass } from '../books/ShelfToolbar'
import AuthorLink from '@/app/components/AuthorLink'
import BookDetailsButton from '../books/BookDetailsButton'
import ReportReviewButton from '../books/ReportReviewButton'
import { reviewedBooks } from '@/lib/reviewedBooks'
import useCollapsedSections from '@/app/hooks/useCollapsedSections'

export interface ReviewedBook {
  id: string
  title: string
  author: string
  coverImage: string
  cardColour: string | null
  // For opening the book's details.
  workKey?: string | null
  pages?: number | null
  rating: number | null
  completedAt: string | null
  review: string | null
  reviewSpoiler: boolean
  reviewHidden?: boolean
  reviewRemoved?: boolean
}

interface ProfileReviewsProps {
  // Books from the profile payload. Reviews the viewer can't see already arrive as null.
  books: ReviewedBook[]
  accentColour?: string | null
  title?: string
  // Someone else's profile: each review gets a Report button.
  canReport?: boolean
  // The reader's reviews page: the heading's "See all" goes there. Without it (on that page), "See all"
  // opens every review in place.
  href?: string
  // The reviews page, whose own title already heads the list: no section heading, just the reviews.
  bare?: boolean
  // Your own profile: the section folds up from its heading, and stays folded.
  collapsible?: boolean
}

// The newest few show straight away; a reader with hundreds of reviews pages through the rest.
const FIRST = 5
const MORE = 20

// The reviews on a profile, newest finish first. Renders nothing when there are none to show.
const ProfileReviews: FC<ProfileReviewsProps> = ({ books, accentColour, title = "Reviews", canReport = false, href, bare = false, collapsible = false }) => {
  const [shown, setShown] = useState(FIRST)
  const collapse = useCollapsedSections()
  const reviewed = reviewedBooks(books)
  if (reviewed.length === 0) return null
  const left = reviewed.length - shown

  const list = (
    <>
      <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {reviewed.slice(0, shown).map((book) => (
          <li key={book.id} className="flex gap-4 py-5 first:pt-0">
            <BookDetailsButton book={book} duplicate className="w-16 shrink-0 self-start transition hover:opacity-90">
              <BookCover book={book} variant="thumb" sizes="64px" className="shadow-sm" />
            </BookDetailsButton>
            <div className="min-w-0 flex-1">
              <BookDetailsButton book={book} className="font-semibold leading-snug break-words hover:underline underline-offset-4">
                <span className="sr-only">About </span>{book.title}
              </BookDetailsButton>
              <p className="text-sm text-muted-foreground"><AuthorLink author={book.author} /></p>
              {book.rating ? <StarRating value={book.rating} readOnly size={14} label="Rating" className="mt-1" /> : null}
              <ReviewText review={book.review} spoiler={book.reviewSpoiler} hidden={book.reviewHidden} removed={book.reviewRemoved} className="mt-2 max-w-2xl" />
              {canReport && <ReportReviewButton bookId={book.id} className="mt-2" />}
            </div>
          </li>
        ))}
      </ul>
      {/* More in place at the foot; "See all" in the heading opens every one. */}
      {left > 0 && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + MORE)} className={pillClass}>Show more</button>
        </div>
      )}
    </>
  )
  if (bare) return list
  return (
    <ShelfSection id="profile-reviews" title={title} count={reviewed.length} {...(collapsible ? collapse("profile-reviews") : {})}
      action={left > 0 ? (href ? <SeeAllLink href={href} /> : <SeeAllLink onClick={() => setShown(reviewed.length)} />) : undefined}>
      {list}
    </ShelfSection>
  )
}

export default ProfileReviews
