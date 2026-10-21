"use client"
import { FC } from 'react'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import Image from 'next/image'
import Link from 'next/link'
import moment from 'moment'
import { IoIosStar } from "react-icons/io"
import { TbBook2, TbBookUpload } from "react-icons/tb"
import { Check, BookPlus, CircleSlash } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReviewText from './ReviewText'

export interface ActivityFeedItemData {
  id: string
  type: "ADDED_BOOK" | "STARTED_BOOK" | "COMPLETED_BOOK" | "DNF_BOOK" | "RATED_BOOK" | "REVIEWED_BOOK"
  createdAt: string
  user: { username: string, image: string | null, favColour: string | null, _count?: { books?: number } }
  // review and reviewSpoiler come only on REVIEWED_BOOK, and only when the viewer may read it.
  book: { title: string, author: string, coverImage: string | null, cardColour: string | null, rating: number | null, review?: string | null, reviewSpoiler?: boolean } | null
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
    case "STARTED_BOOK": return <TbBook2 size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "COMPLETED_BOOK": return <Check size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "DNF_BOOK": return <CircleSlash size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "RATED_BOOK": return <IoIosStar size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "REVIEWED_BOOK": return <TbBookUpload size={18} className="flex-shrink-0 text-muted-foreground"/>
  }
}

const ActivityFeedItem: FC<ActivityFeedItemProps> = ({ activity }) => {
  const booksReadFor = useBooksReadFor()
  if (!activity.book) return null
  const review = activity.type === "REVIEWED_BOOK" ? activity.book.review : null

  return (
    <div className={cn("flex gap-3 p-3 rounded-lg border border-neutral-700", review ? "items-start" : "items-center")}>
      <Link href={`/u/${activity.user.username}`} className="h-10 w-10 flex-shrink-0 rounded-full overflow-hidden relative" style={{ background: activity.user.favColour || "#f44336", ...tierRingStyle(booksReadFor(activity.user.username, booksReadOf(activity.user))) }}>
        {activity.user.image && <Image src={activity.user.image} alt="" fill className="object-cover" />}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link href={`/u/${activity.user.username}`} className="font-semibold hover:underline">{activity.user.username}</Link>
          {" "}{typeCopy[activity.type](activity.book.title)}
          {activity.type === "RATED_BOOK" && activity.book.rating ? ` (${activity.book.rating}★)` : ""}
        </p>
        <p className="truncate text-xs text-muted-foreground">by {activity.book.author} &middot; {moment(activity.createdAt).fromNow()}</p>
        {review && <ReviewText review={review} spoiler={activity.book.reviewSpoiler} maxChars={220} className="mt-2" />}
      </div>
      {renderTypeIcon(activity.type)}
    </div>
  )
}

export default ActivityFeedItem
