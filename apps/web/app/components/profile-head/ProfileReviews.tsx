"use client"
import { FC, useState } from 'react'
import BookCover from '../cards/BookCover'
import StarRating from '../StarRating'
import Link from 'next/link'
import { EyeOff, Lock } from 'lucide-react'
import { SeeAllLink, ShelfSection } from '../books/shelf'
import { pillClass } from '../books/ShelfToolbar'
import AuthorLink from '@/app/components/AuthorLink'
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
  // The reader's reviews page (/u/<username>/reviews): the heading's "See all" goes there, and each review's
  // own page sits beneath it. Without it (on that page), "See all" opens every review in place.
  href?: string
  // The reviews page, whose own title already heads the list: no section heading, just the reviews.
  bare?: boolean
  // Your own profile: the section folds up from its heading, and stays folded.
  collapsible?: boolean
  // How many show before "Show more": fewer in bands, where reviews sit above the shelves.
  first?: number
  // Every review, when `books` holds only the newest (someone else's profile, profilePreview): past those,
  // "See all" opens the reviews page.
  total?: number
}

// The newest few show straight away; a reader with hundreds of reviews pages through the rest.
const FIRST = 5
const MORE = 20

// The reviews on a profile, newest finish first. Renders nothing when there are none to show.
const ProfileReviews: FC<ProfileReviewsProps> = ({ books, accentColour, title = "Reviews", href, bare = false, collapsible = false, first = FIRST, total }) => {
  const [shown, setShown] = useState(first)
  const collapse = useCollapsedSections()
  const reviewed = reviewedBooks(books)
  if (reviewed.length === 0) return null
  const left = reviewed.length - shown
  const count = Math.max(total ?? 0, reviewed.length)
  // More than the page carries: the rest are on the reviews page.
  const elsewhere = left <= 0 && count > reviewed.length && !!href
  const reviewHref = (id: string) => `${href}/${id}`

  const list = (
    <>
      <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {reviewed.slice(0, shown).map((book) => (
          // The whole card opens the review (the title's link is stretched over it); the author's link sits above.
          <li key={book.id} className="group relative flex gap-3 py-3.5 first:pt-0">
            <BookCover book={book} variant="thumb" sizes="48px" className="w-12 shrink-0 self-start shadow-sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link href={reviewHref(book.id)} className="font-semibold leading-snug break-words after:absolute after:inset-0 group-hover:underline underline-offset-4 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:rounded-md">
                  <span className="sr-only">Read the review of </span>{book.title}
                </Link>
                <span className="relative z-10 text-sm text-muted-foreground"><AuthorLink author={book.author} /></span>
              </div>
              {book.rating ? <StarRating value={book.rating} readOnly size={13} label="Rating" className="mt-0.5" /> : null}
              {(book.reviewHidden || book.reviewSpoiler) && (
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {book.reviewHidden && (
                    <span className="inline-flex items-center gap-1">
                      <Lock size={12} aria-hidden />{book.reviewRemoved ? "Hidden by the Bookmark team. Only you can see it." : "Only you can see this review"}
                    </span>
                  )}
                  {book.reviewSpoiler && <span className="inline-flex items-center gap-1"><EyeOff size={12} aria-hidden />Contains spoilers</span>}
                </p>
              )}
              {/* A spoiler stays covered until the review's own page, where it can be revealed. */}
              {!book.reviewSpoiler && <p className="mt-1 max-w-2xl whitespace-pre-line break-words text-sm line-clamp-3">{book.review}</p>}
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
      {elsewhere && href && (
        <div className="mt-4 flex justify-center">
          <Link href={href} className={`${pillClass} inline-flex items-center`}>See all {count.toLocaleString('en-GB')}</Link>
        </div>
      )}
    </>
  )
  if (bare) return list
  return (
    <ShelfSection id="profile-reviews" title={title} count={count} {...(collapsible ? collapse("profile-reviews") : {})}
      action={left > 0 || elsewhere ? (href ? <SeeAllLink href={href} /> : <SeeAllLink onClick={() => setShown(reviewed.length)} />) : undefined}>
      {list}
    </ShelfSection>
  )
}

export default ProfileReviews
