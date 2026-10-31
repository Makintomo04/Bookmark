"use client"
import { FC } from 'react'
import Link from 'next/link'
import moment from 'moment'
import { Plus, Users } from 'lucide-react'
import useClubs, { type ClubSummary } from '@/app/hooks/useClubs'
import BookCover from '../cards/BookCover'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'

const ROLE_LABEL = { host: "You're hosting", cohost: "Co-host", member: null } as const

const ClubCard: FC<{ club: ClubSummary }> = ({ club }) => {
  const book = club.current
  return (
    <Link
      href={`/clubs/${club.id}`}
      className="flex gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {book ? (
        <BookCover book={{ title: book.title, author: book.author, coverImage: book.coverImage ?? "", cardColour: book.cardColour }} variant="thumb" sizes="48px" className="w-12 shrink-0 self-start shadow-sm" />
      ) : (
        <span aria-hidden className="flex aspect-[2/3] w-12 shrink-0 items-center justify-center self-start rounded-sm bg-neutral-100 dark:bg-neutral-900 text-muted-foreground">
          <Users size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug line-clamp-2">{club.name}</p>
        <p className="text-sm text-muted-foreground truncate" suppressHydrationWarning>
          {book ? (book.upcoming ? `Next: ${book.title}, from ${moment(book.startsAt).format("D MMMM")}` : `Reading ${book.title}`) : "No book yet"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {club.memberCount} {club.memberCount === 1 ? "member" : "members"}{ROLE_LABEL[club.role] ? ` · ${ROLE_LABEL[club.role]}` : ""}
        </p>
      </div>
    </Link>
  )
}

// On the reading circles page: the reader's clubs, each a group that reads one book after another.
const ClubsSection: FC = () => {
  const { clubs } = useClubs()
  if (!clubs) return null

  return (
    <section aria-labelledby="clubs-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="clubs-heading" className="text-lg font-semibold">Clubs</h2>
          {clubs.length === 0 && (
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              A club reads one book after another with the same people. Members join once with one link and are added to every new book.
            </p>
          )}
        </div>
        {/* Shown past the limit too: the form says why, with the Plus prompt. */}
        <Link href="/clubs/new" className={secondaryButtonClass}><Plus size={16} aria-hidden />Start a club</Link>
      </div>
      {clubs.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {clubs.map((c) => <li key={c.id}><ClubCard club={c} /></li>)}
        </ul>
      )}
    </section>
  )
}

export default ClubsSection
