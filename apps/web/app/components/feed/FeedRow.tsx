"use client"
import { FC, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import InitialAvatar, { avatarColour } from '../profile/InitialAvatar'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'

// The rows of the feed page, whichever tab: whoever did it on the left, what they did in the middle, and
// something small on the right (the kind of activity, a dot for a new notification). The bell's menu
// uses the avatar too, a size down.

export type Actor = { username: string; image?: string | null; favColour?: string | null; _count?: { books?: number } }

// Their photo, or their initial on their colour, inside their tier ring.
export const ActorAvatar: FC<{ actor: Actor; size?: "sm" | "md" }> = ({ actor, size = "md" }) => {
  const booksReadFor = useBooksReadFor()
  const px = size === "sm" ? 36 : 40
  return (
    <div className={cn("flex-shrink-0 rounded-full overflow-hidden relative", size === "sm" ? "h-9 w-9" : "h-10 w-10")}
      style={{ background: avatarColour(actor.favColour), ...tierRingStyle(booksReadFor(actor.username, booksReadOf(actor))) }}>
      {actor.image
        ? <Image src={actor.image} alt="" fill sizes={`${px}px`} className="object-cover" />
        : <InitialAvatar username={actor.username} favColour={actor.favColour} label="" />}
    </div>
  )
}

export const FeedList: FC<{ children: ReactNode }> = ({ children }) => (
  <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">{children}</ul>
)

export const FeedEmpty: FC<{ children: ReactNode }> = ({ children }) => (
  <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>
)

interface FeedRowProps {
  // The whole row is a link when given; otherwise its parts link on their own.
  href?: string
  // Top-aligned when the row has more than a line or two (a review).
  align?: "center" | "start"
  children: ReactNode
  // Buttons under the row, indented past the avatar.
  actions?: ReactNode
}

export const FeedRow: FC<FeedRowProps> = ({ href, align = "center", children, actions }) => {
  const rowClass = cn("relative flex gap-3 rounded-lg p-2", align === "start" ? "items-start" : "items-center")
  return (
    <li className="py-1">
      {href
        ? <Link href={href} className={cn(rowClass, "transition hover:bg-neutral-100 dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>{children}</Link>
        : <div className={rowClass}>{children}</div>}
      {actions && <div className="flex gap-2 pl-14 pb-2">{actions}</div>}
    </li>
  )
}
