import { FC } from 'react'
import BookCover from '../cards/BookCover'
import StarRating from '../StarRating'
import ReviewText from '../feed/ReviewText'
import { ShelfSection } from '../books/shelf'
import AuthorLink from '@/app/components/AuthorLink'

export interface ReviewedBook {
  id: string
  title: string
  author: string
  coverImage: string
  cardColour: string | null
  rating: number | null
  completedAt: string | null
  review: string | null
  reviewSpoiler: boolean
  reviewHidden?: boolean
}

interface ProfileReviewsProps {
  // Books from the profile payload. Reviews the viewer can't see already arrive as null.
  books: ReviewedBook[]
  accentColour?: string | null
  title?: string
}

const time = (date: string | null) => (date ? new Date(date).getTime() : 0)

// The reviews on a profile, newest finish first. Renders nothing when there are none to show.
const ProfileReviews: FC<ProfileReviewsProps> = ({ books, accentColour, title = "Reviews" }) => {
  const reviewed = books
    .filter((b): b is ReviewedBook & { review: string } => !!b.review)
    .sort((a, b) => time(b.completedAt) - time(a.completedAt))
  if (reviewed.length === 0) return null

  return (
    <ShelfSection id="profile-reviews" title={title} count={reviewed.length}>
      <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {reviewed.map((book) => (
          <li key={book.id} className="flex gap-4 py-5 first:pt-0">
            <BookCover book={book} fallbackColour={accentColour} variant="thumb" sizes="64px" className="w-16 shrink-0 self-start shadow-sm" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug break-words">{book.title}</p>
              <p className="text-sm text-muted-foreground"><AuthorLink author={book.author} /></p>
              {book.rating ? <StarRating value={book.rating} readOnly size={14} label="Rating" className="mt-1" /> : null}
              <ReviewText review={book.review} spoiler={book.reviewSpoiler} hidden={book.reviewHidden} className="mt-2 max-w-2xl" />
            </div>
          </li>
        ))}
      </ul>
    </ShelfSection>
  )
}

export default ProfileReviews
