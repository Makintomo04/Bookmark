"use client"
import { FC } from 'react'
import { readerName } from '@/lib/profile'
import ReaderName from '@/app/components/profile/ReaderName'
import Link from 'next/link'
import moment from 'moment'
import { Check, BookOpen, BookPlus, BookUp, CircleSlash, Star } from 'lucide-react'
import ReviewText from './ReviewText'
import ReportReviewButton from '../books/ReportReviewButton'
import AuthorLink from '@/app/components/AuthorLink'
import { ActorAvatar, FeedRow } from './FeedRow'

export interface ActivityFeedItemData {
  id: string
  type: "ADDED_BOOK" | "STARTED_BOOK" | "COMPLETED_BOOK" | "DNF_BOOK" | "RATED_BOOK" | "REVIEWED_BOOK"
  createdAt: string
  user: { username: string, displayName?: string | null, image: string | null, favColour: string | null, _count?: { books?: number } }
  // review and reviewSpoiler come only on REVIEWED_BOOK, and only when the viewer may read it.
  // `id` is the reader's copy (Activity.bookId), for reporting a review.
  book: { id?: string | null, title: string, author: string, coverImage: string | null, cardColour: string | null, rating: number | null, review?: string | null, reviewSpoiler?: boolean } | null
}

interface ActivityFeedItemProps {
  activity: ActivityFeedItemData
}

const typeCopy: Record<ActivityFeedItemData["type"], (bookTitle: string) => string> = {
  // "shelf", not "list": lists are the curated recommendation lists.
  ADDED_BOOK: (title) => `added ${title} to their shelf`,
  STARTED_BOOK: (title) => `started reading ${title}`,
  COMPLETED_BOOK: (title) => `finished ${title}`,
  DNF_BOOK: (title) => `stopped reading ${title}`,
  RATED_BOOK: (title) => `rated ${title}`,
  REVIEWED_BOOK: (title) => `reviewed ${title}`,
}

const renderTypeIcon = (type: ActivityFeedItemData["type"]) => {
  switch (type) {
    case "ADDED_BOOK": return <BookPlus size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "STARTED_BOOK": return <BookOpen size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "COMPLETED_BOOK": return <Check size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "DNF_BOOK": return <CircleSlash size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "RATED_BOOK": return <Star size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "REVIEWED_BOOK": return <BookUp size={18} className="flex-shrink-0 text-muted-foreground"/>
  }
}

const ActivityFeedItem: FC<ActivityFeedItemProps> = ({ activity }) => {
  if (!activity.book) return null
  const review = activity.type === "REVIEWED_BOOK" ? activity.book.review : null
  const profile = `/u/${encodeURIComponent(activity.user.username)}`

  return (
    <FeedRow align={review ? "start" : "center"}>
      <Link href={profile} aria-label={`${readerName(activity.user)}'s profile`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ActorAvatar actor={activity.user} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link href={profile} className="font-semibold hover:underline"><ReaderName reader={activity.user} /></Link>
          {" "}{typeCopy[activity.type](activity.book.title)}
          {activity.type === "RATED_BOOK" && activity.book.rating ? ` (${activity.book.rating}★)` : ""}
        </p>
        <p className="truncate text-xs text-muted-foreground">by <AuthorLink author={activity.book.author} /> &middot; {moment(activity.createdAt).fromNow()}</p>
        {review && <ReviewText review={review} spoiler={activity.book.reviewSpoiler} maxChars={220} className="mt-2" />}
        {review && activity.book.id && <ReportReviewButton bookId={activity.book.id} className="mt-2" />}
      </div>
      {renderTypeIcon(activity.type)}
    </FeedRow>
  )
}

export default ActivityFeedItem
