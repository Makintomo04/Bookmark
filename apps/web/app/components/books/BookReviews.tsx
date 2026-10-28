"use client"
import { FC, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import useSWR from 'swr'
import { fetcher, swrOptions } from '@/lib/fetcher'
import type { WorkReview, WorkReviewsPage } from '@/lib/workReviewRules'
import StarRating from '../StarRating'
import ReviewText from '../feed/ReviewText'
import ReportReviewButton from './ReportReviewButton'
import { CuratorAvatar } from '../lists/CuratorNote'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import StaffSeal from '../profile-head/StaffSeal'

const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const ReviewItem: FC<{ review: WorkReview }> = ({ review }) => {
  const name = review.person.username
  return (
    <li className="flex gap-3 py-5 first:pt-0">
      {name ? (
        <Link href={`/u/${name}`} aria-hidden tabIndex={-1} className="shrink-0">
          <CuratorAvatar person={review.person} size={36} />
        </Link>
      ) : (
        <CuratorAvatar person={review.person} size={36} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {name ? <Link href={`/u/${name}`} className="font-semibold hover:underline underline-offset-2">{name}</Link> : <span className="font-semibold">A reader</span>}
          {review.staffBadge && <StaffSeal kind={review.staffBadge} name={name} size={18} className="ml-1 align-[-4px]" />}
          {review.isMine && <span className="text-muted-foreground"> · You</span>}
          <span className="text-muted-foreground"> · {dateOf(review.at)}</span>
        </p>
        {review.rating ? <StarRating value={review.rating} readOnly size={14} label="Rating" className="mt-1" /> : null}
        <ReviewText review={review.review} spoiler={review.reviewSpoiler} hidden={review.reviewHidden} removed={review.reviewRemoved} className="mt-2 max-w-2xl" />
        {!review.isMine && <ReportReviewButton bookId={review.id} className="mt-2" />}
      </div>
    </li>
  )
}

// A book page's reviews. The first page comes from the server; it refreshes when the reader saves a
// review of their own (refreshAfterBookChange), and later pages load on request.
const BookReviews: FC<{ bookKey: string, initial: WorkReviewsPage, headingClassName?: string }> = ({ bookKey, initial, headingClassName = "text-xl font-bold" }) => {
  const { data: first = initial } = useSWR<WorkReviewsPage>(
    `/api/books/reviews?workKey=${encodeURIComponent(bookKey)}`,
    fetcher,
    { ...swrOptions, fallbackData: initial, revalidateOnMount: false },
  )
  const [more, setMore] = useState<WorkReview[]>([])
  const [nextOffset, setNextOffset] = useState(first.nextOffset)
  const [isLoading, setIsLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  // A link straight to the reviews (a hidden review's notification) lands here. The page shows a loading
  // screen first, so the router's own jump to #reviews-heading finds nothing; do it once the section is in.
  useEffect(() => {
    if (window.location.hash === '#reviews-heading') document.getElementById('reviews-heading')?.scrollIntoView()
  }, [])

  // A refreshed first page starts the list over.
  useEffect(() => {
    setMore([])
    setNextOffset(first.nextOffset)
  }, [first])

  const loadMore = () => {
    if (nextOffset === null) return
    setIsLoading(true)
    setFailed(false)
    axios.get<WorkReviewsPage>(`/api/books/reviews?workKey=${encodeURIComponent(bookKey)}&offset=${nextOffset}`)
      .then((res) => {
        setMore((current) => [...current, ...res.data.reviews])
        setNextOffset(res.data.nextOffset)
      })
      .catch(() => setFailed(true))
      .finally(() => setIsLoading(false))
  }

  const reviews = [...first.reviews, ...more]

  return (
    <section aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className={headingClassName}>
        Community reviews{first.total > 0 && <span className="ml-2 font-sans text-base font-normal text-muted-foreground tabular-nums">{first.total.toLocaleString('en-GB')}</span>}
      </h2>
      {reviews.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No reviews yet. Finished it? Be the first.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
          {reviews.map((review) => <ReviewItem key={review.id} review={review} />)}
        </ul>
      )}
      {(nextOffset !== null || failed) && (
        <div className="mt-6 flex flex-col items-center gap-2">
          {failed && <p className="text-sm text-muted-foreground">Couldn&apos;t load more reviews.</p>}
          <button type="button" onClick={loadMore} disabled={isLoading} className={secondaryButtonClass}>
            {isLoading ? "Loading…" : failed ? "Try again" : "Show more reviews"}
          </button>
        </div>
      )}
    </section>
  )
}

export default BookReviews
