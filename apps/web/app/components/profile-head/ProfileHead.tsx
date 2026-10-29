"use client"
import { FC, useState } from 'react'
import { BLEED } from '../Container'
import { Lightbox } from "react-modal-image"
import { Book } from '@prisma/client'
import { Plus } from 'lucide-react'
import useUser from '@/app/hooks/useUser'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import useBooks from '@/app/hooks/useBooks'
import useAchievements from '@/app/hooks/useAchievements'
import usePublicProfile from '@/app/hooks/usePublicProfile'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import useEditProfileModal from '@/app/hooks/useEditProfileModal'
import { Skeleton } from '../ui/skeleton'
import ProfileHeader, { primaryButtonClass, secondaryButtonClass } from './ProfileHeader'
import { reviewedBooks } from '@/lib/reviewedBooks'
import ReadingGoalWidget from './ReadingGoalWidget'
import ContinueReading from './ContinueReading'
import UpNext from './UpNext'
import ShelfSearch from './ShelfSearch'
import GapFiller from './GapFiller'
import BookList from '../books/BookList'
import MedalShowcase from '../achievements/MedalShowcase'
import { useSharedShelfFilter } from '@/app/hooks/useShelfFilter'
import { isNarrowed } from '@/lib/shelfFilter'
import { groupShelf } from '../books/shelf'
import useSWR from 'swr'
import { fetcher, swrOptions } from '@/lib/fetcher'
import type { FollowedAuthor } from '@/lib/authorFollows'
import type { ProfileLayout } from './Band'
import ShareProfileButton from './ShareProfileButton'
import FetchErrorState from '../FetchErrorState'
import { isFinishedBook } from '@/lib/readerTier'
import { resolveBanner } from '@/lib/banners'
import { supporterOf } from '@/lib/supporter'
import { staffBadgeOf } from '@/lib/staffBadge'
import { milestoneKey, type AchievementKey } from '@/lib/achievements-catalog'

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

// Beside your header in bands from lg up (under it below lg): what you're reading, with the shelf search on the
// heading's right, then what to start next. With nothing on the go, Up next leads (your header says so in a
// line). While you search, both make way for the results, right under the field: a full-width panel lower
// down would start below your column, however tall it is.
const BooksTop: FC = () => {
  const { user } = useUser()
  const { books } = useBooks()
  const shared = useSharedShelfFilter()
  if (!Array.isArray(books)) return <Skeleton className="h-40 w-full rounded-xl" />
  const { reading } = groupShelf(books as Book[])
  const searching = !!shared && (isNarrowed(shared.filter) || shared.filtersOpen)
  return (
    <section aria-labelledby="continue-reading">
      <div className="mb-4 flex min-h-10 items-center justify-between gap-4">
        <h2 id="continue-reading" className="flex items-baseline gap-2 text-lg font-semibold">
          {searching ? "Your shelf" : reading.length > 0 ? <>Continue reading <span className="text-sm font-normal text-muted-foreground tabular-nums">{reading.length}</span></> : "Up next"}
        </h2>
        <ShelfSearch />
      </div>
      {searching ? <BookList slot="results" /> : reading.length > 0
        ? <><ContinueReading books={reading} accentColour={user?.favColour} /><UpNext /></>
        : <UpNext bare />}
    </section>
  )
}

// Under your stats in bands, when you're reading nothing: said once, with the way to start.
const NothingOnTheGo: FC = () => {
  const { books } = useBooks()
  const bookEntryModal = useBookEntryModal()
  if (!Array.isArray(books) || groupShelf(books as Book[]).reading.length > 0) return null
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      Not reading anything right now ·{" "}
      <button type="button" onClick={() => bookEntryModal.onOpen(undefined, { shelf: "STARTED" })} className="font-medium text-foreground hover:underline underline-offset-2">+ Start a book</button>
    </p>
  )
}

// In bands (?layout=bands) your header becomes a column from lg up, with what you're reading beside it. The goal
// is two lines in that column, or two lines in words under your stats below lg; the authors you follow get a line
// under your bio; the banner is shorter.
const ProfileHead: FC<{ layout?: ProfileLayout }> = ({ layout = 'stack' }) => {
  const bands = layout === 'bands'
  const { user, isError, isLoading, mutate: mutateUser } = useUser()
  const booksReadFor = useBooksReadFor()
  const { books } = useBooks()
  const { achievements, isLoading: achievementsLoading } = useAchievements()
  const { profile } = usePublicProfile(user?.username ?? "")
  const bookEntryModal = useBookEntryModal()
  const editProfileModal = useEditProfileModal()
  const [showLightbox, setShowLightbox] = useState(false)
  // The same list as Authors you follow further down, so it's one request.
  const { data: followed } = useSWR<{ authors: FollowedAuthor[] }>(bands ? '/api/user/authors' : null, fetcher, swrOptions)

  // SWR reports isLoading while it revalidates server-provided fallback data too, so check for data.
  if (isLoading && !user) {
    return (
      <div>
        <Skeleton className={`h-24 sm:h-44 sm:rounded-2xl ${BLEED}`} />
        <div>
          <Skeleton className="-mt-9 sm:-mt-14 size-20 sm:size-28 rounded-[32px] border-4 border-background" />
          <Skeleton className="mt-4 h-8 w-48" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
      </div>
    )
  }

  if (isError || !user) {
    return <FetchErrorState error={isError} what="your profile" onRetry={() => mutateUser()}/>
  }

  // Until the shelf and achievements load, use the counts that came with the server render, so the stats don't flash 0.
  const booksRead = books ? books.filter(isFinishedBook).length : user._count?.books ?? 0
  const earnedKeys = achievementsLoading
    ? profile?.achievements ?? []
    : achievements.flatMap((a) => a.milestones.filter((m) => m.earned).map((m) => ({ key: milestoneKey(a.key as AchievementKey, m.value) })))
  const earned = earnedKeys.length
  const followers = profile?.followerCount ?? 0
  const following = profile?.followingCount ?? 0
  // Calm social: with counts hidden, even the owner just gets the links to the lists.
  const hideCounts = !!user.hideFollowCounts
  // Your reviews: finished books with one, as your reviews section and page count them. Until the shelf
  // loads, the server's copy of your profile.
  const shelf = (books as Book[] | undefined) ?? (profile?.books as unknown as Book[] | undefined) ?? []
  const reviews = reviewedBooks(shelf.filter((b) => b.status === "COMPLETED").map((b) => ({ ...b, completedAt: b.completedAt ? String(b.completedAt) : null }))).length

  return (
    <>
      <ProfileHeader
        username={user.username}
        displayName={user.displayName}
        booksRead={booksReadFor(user.username, booksRead)}
        bio={user.bio}
        image={user.image}
        banner={resolveBanner(user.banner, user.id)}
        colour={user.favColour}
        {...supporterOf(user)}
        staffBadge={staffBadgeOf(user)}
        compact={bands}
        besides={bands ? <BooksTop /> : undefined}
        identityFooter={bands ? <GapFiller><MedalShowcase earned={earnedKeys} href="/achievements" stacked /></GapFiller> : undefined}
        follows={bands ? followed?.authors : undefined}
        followsPrompt={bands}
        onAvatarClick={user.image ? () => setShowLightbox(true) : undefined}
        stats={[
          { value: booksRead, label: plural(booksRead, "book read", "books read") },
          { value: reviews, label: plural(reviews, "review"), href: `/u/${encodeURIComponent(user.username)}/reviews` },
          { value: hideCounts ? null : followers, label: hideCounts ? "Followers" : plural(followers, "follower"), followList: { username: user.username, kind: "followers" } },
          { value: hideCounts ? null : following, label: hideCounts ? "Following" : "following", followList: { username: user.username, kind: "following" } },
          { value: earned, label: plural(earned, "achievement"), href: "/achievements" },
        ]}
        actions={
          <>
            <ShareProfileButton username={user.username} />
            <button type="button" onClick={editProfileModal.onOpen} className={`${secondaryButtonClass} max-sm:px-3`}>
              <span className="sm:hidden">Edit</span><span className="hidden sm:inline">Edit profile</span>
            </button>
            <button type="button" onClick={() => bookEntryModal.onOpen()} className={`${primaryButtonClass} max-sm:px-3`}>
              <Plus size={16} aria-hidden /><span className="sm:hidden">Add</span><span className="hidden sm:inline">Add a book</span>
            </button>
          </>
        }
      >
        {/* One slim line, so the first cover on the shelf is in view without scrolling, even on a phone. */}
        {bands ? (
          <>
            <NothingOnTheGo />
            <div className="lg:hidden"><ReadingGoalWidget variant="lines" /></div>
            <div className="hidden lg:block"><ReadingGoalWidget variant="block" /></div>
          </>
        ) : <ReadingGoalWidget />}
      </ProfileHeader>

      {showLightbox && user.image && (
        <Lightbox
          small={user.image}
          large={user.image}
          alt="Profile picture"
          hideDownload={true}
          /** @ts-ignore */
          onClose={() => setShowLightbox(false)}
        />
      )}
    </>
  )
}

export default ProfileHead
