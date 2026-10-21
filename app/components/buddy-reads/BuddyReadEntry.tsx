"use client"
import { FC } from 'react'
import Link from 'next/link'
import { Users } from 'lucide-react'
import type { Book } from '@prisma/client'
import useBuddyReads from '@/app/hooks/useBuddyReads'
import MemberAvatar from './MemberAvatar'

interface BuddyReadEntryProps {
  book: Pick<Book, 'id' | 'status'>
  // Following a link closes the modal it sits in.
  onNavigate: () => void
}

// The way into buddy reads from a shelf book: open the ones it's in, or start one.
const BuddyReadEntry: FC<BuddyReadEntryProps> = ({ book, onNavigate }) => {
  const canStart = book.status === "NOT_STARTED" || book.status === "STARTED" || book.status === "PAUSED"
  const { buddyReads } = useBuddyReads(book.id)
  const open = (buddyReads ?? []).filter((b) => b.status !== "ARCHIVED")

  if (open.length === 0 && !canStart) return null

  return (
    <section aria-labelledby="buddy-read-entry" className="flex flex-col gap-2">
      <h3 id="buddy-read-entry" className="text-sm font-medium">Buddy read</h3>
      {open.map((b) => {
        const others = b.members.length - 1
        return (
          <Link
            key={b.id}
            href={`/buddy-reads/${b.id}`}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-lg bg-neutral-100 dark:bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex -space-x-1.5">
              {b.members.slice(0, 4).map((m) => (
                <MemberAvatar key={m.userId} username={m.username} image={m.image} favColour={m.favColour} size={22} className="ring-2 ring-neutral-100 dark:ring-neutral-900" />
              ))}
            </span>
            <span className="flex-1">
              {others > 0 ? `Reading with ${others} ${others === 1 ? "other" : "others"}` : "Waiting for others to join"}
            </span>
            <span className="font-medium underline underline-offset-4">Open</span>
          </Link>
        )
      })}
      {open.length === 0 && (
        <Link
          href={`/buddy-reads/new?bookId=${book.id}`}
          onClick={onNavigate}
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          <Users size={16} aria-hidden /> Read it with friends
        </Link>
      )}
    </section>
  )
}

export default BuddyReadEntry
