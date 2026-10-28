import { FC } from 'react'
import { readerName } from '@/lib/profile'
import Link from 'next/link'
import { ListOrdered, Star, Users } from 'lucide-react'
import { followingPicks, type FollowingPick } from '@/lib/lists'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import { CuratorAvatar } from '../lists/CuratorNote'
import StaffSeal from '../profile-head/StaffSeal'
import DiscoverBookCard from './DiscoverBookCard'


// Who picked it and where, under the card. The reason itself is the card's CuratorNote.
// The seal only marks the role here: the line is cut short when long, which would clip its explanation.
const Who: FC<{ pick: FollowingPick }> = ({ pick }) => (
  <>
    {readerName(pick.person)}
    {pick.person.staffBadge && <StaffSeal kind={pick.person.staffBadge} size={13} pressable={false} className="ml-0.5 align-[-2px]" />}
    {" · "}
  </>
)

const PickContext: FC<{ pick: FollowingPick }> = ({ pick }) => (
  <p className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
    {!pick.reason && <CuratorAvatar person={pick.person} size={16} />}
    {pick.list ? (
      <>
        <ListOrdered size={12} aria-hidden className="shrink-0" />
        <span className="truncate">
          {!pick.reason && <Who pick={pick} />}
          <Link href={`/lists/${pick.list.id}`} className="hover:underline underline-offset-2">{pick.list.title}</Link>
        </span>
      </>
    ) : (
      <>
        <Star size={12} aria-hidden className="shrink-0 fill-current" />
        <span className="truncate">{!pick.reason && <Who pick={pick} />}Rated {String(pick.rating ?? 0)}</span>
      </>
    )}
  </p>
)

const Heading = () => (
  <>
    <h2 id="following-heading" className="text-xl font-bold">From people you follow</h2>
    <p className="mt-1 text-sm text-muted-foreground">Books readers you follow just added to their lists or loved, in their own words.</p>
  </>
)

// Discover: recent picks by the people the reader follows. No algorithm: each card is one
// person's choice, newest first, with their reason when they gave one.
const FollowingPicks = async ({ viewerId }: { viewerId: string }) => {
  const { followsAnyone, picks } = await followingPicks(viewerId)

  if (!followsAnyone) {
    return (
      <section aria-labelledby="following-heading">
        <Heading />
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-100 dark:bg-neutral-900"><Users size={20} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Recommendations here come from people, not an algorithm.</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Follow a few readers whose taste you trust, and the books they list and love will show up here with their reasons.</p>
          </div>
          <Link href="/discover?find=people" className={secondaryButtonClass}>Find people to follow</Link>
        </div>
      </section>
    )
  }

  if (picks.length === 0) {
    return (
      <section aria-labelledby="following-heading">
        <Heading />
        <p className="mt-4 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-sm text-muted-foreground">
          Nobody you follow has added to a public list or rated a book 4 stars or more lately. Check back soon, or{" "}
          <Link href="/discover?find=people" className="font-medium text-foreground underline underline-offset-4">find more readers</Link>.
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="following-heading">
      <Heading />
      <div className="mt-4 -mx-4 px-4 flex sm:grid sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-10 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-2">
        {picks.map((pick) => (
          <div key={pick.key} className="flex w-40 shrink-0 sm:w-auto snap-start">
            <DiscoverBookCard
              book={pick.book}
              reason={pick.reason ? { text: pick.reason, by: pick.person } : null}
              context={<PickContext pick={pick} />}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

export default FollowingPicks
