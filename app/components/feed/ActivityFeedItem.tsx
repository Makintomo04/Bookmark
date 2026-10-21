"use client"
import { FC } from 'react'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import Image from 'next/image'
import Link from 'next/link'
import moment from 'moment'
import { IoIosStar } from "react-icons/io"
import { TbBook2, TbBookUpload } from "react-icons/tb"
import { Check, BookPlus } from 'lucide-react'

export interface ActivityFeedItemData {
  id: string
  type: "ADDED_BOOK" | "STARTED_BOOK" | "COMPLETED_BOOK" | "RATED_BOOK" | "REVIEWED_BOOK"
  createdAt: string
  user: { username: string, image: string | null, favColour: string | null, _count?: { books?: number } }
  book: { title: string, author: string, coverImage: string | null, cardColour: string | null, rating: number | null } | null
}

interface ActivityFeedItemProps {
  activity: ActivityFeedItemData
}

const typeCopy: Record<ActivityFeedItemData["type"], (bookTitle: string) => string> = {
  ADDED_BOOK: (title) => `added ${title} to their list`,
  STARTED_BOOK: (title) => `started reading ${title}`,
  COMPLETED_BOOK: (title) => `finished ${title}`,
  RATED_BOOK: (title) => `rated ${title}`,
  REVIEWED_BOOK: (title) => `reviewed ${title}`,
}

const renderTypeIcon = (type: ActivityFeedItemData["type"]) => {
  switch (type) {
    case "ADDED_BOOK": return <BookPlus size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "STARTED_BOOK": return <TbBook2 size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "COMPLETED_BOOK": return <Check size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "RATED_BOOK": return <IoIosStar size={18} className="flex-shrink-0 text-muted-foreground"/>
    case "REVIEWED_BOOK": return <TbBookUpload size={18} className="flex-shrink-0 text-muted-foreground"/>
  }
}

const ActivityFeedItem: FC<ActivityFeedItemProps> = ({ activity }) => {
  const booksReadFor = useBooksReadFor()
  if (!activity.book) return null

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-neutral-700">
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
      </div>
      {renderTypeIcon(activity.type)}
    </div>
  )
}

export default ActivityFeedItem
