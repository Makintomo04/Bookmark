"use client"
import { FC, useState } from 'react'
import { cn } from '@/lib/utils'
import { Lightbox } from "react-modal-image"
import { Book } from '@prisma/client'
import Link from 'next/link'
import useUser from '@/app/hooks/useUser'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import useBooks from '@/app/hooks/useBooks'
import useAchievements from '@/app/hooks/useAchievements'
import usePublicProfile from '@/app/hooks/usePublicProfile'
import useEditProfileModal from '@/app/hooks/useEditProfileModal'
import ProfileSkeleton, { ReadingNowSkeleton } from './ProfileSkeleton'
import ProfileHeader, { secondaryButtonClass } from './ProfileHeader'
import ReadingGoalWidget from './ReadingGoalWidget'
import ContinueReading from './ContinueReading'
import UpNext from './UpNext'
import ShelfSearch from './ShelfSearch'
import ProfileLinkRows from './ProfileLinkRows'
import BandsShowcase, { ProfileFavourites } from './BandsShowcase'
import BookList from '../books/BookList'
import { useSharedShelfFilter } from '@/app/hooks/useShelfFilter'
import { isNarrowed } from '@/lib/shelfFilter'
import { groupShelf } from '../books/shelf'
import { BANDS_REVIEWS, type ProfileLayout } from './Band'
import OwnReviews from './OwnReviews'
import ShareProfileButton from './ShareProfileButton'
import FetchErrorState from '../FetchErrorState'
import { isFinishedBook } from '@/lib/readerTier'
import { supporterOf } from '@/lib/supporter'
import { staffBadgeOf } from '@/lib/staffBadge'
import { milestoneKey, type AchievementKey } from '@/lib/achievements-catalog'

// Your achievements and your stats, as rows: under your header's column from lg up, at the end of the page below it.
export const ownLinkRows = (earned: number) => [
  { label: "Achievements", href: "/achievements", count: earned },
  { label: "Stats and streaks", href: "/stats" },
]

// The same rows at the end of your profile below lg, counted from your achievements alone.
export const OwnLinkRows: FC = () => {
  const { achievements } = useAchievements()
  const earned = achievements.reduce((n, a) => n + a.milestones.filter((m) => m.earned).length, 0)
  return <ProfileLinkRows className="!border-t-0" rows={ownLinkRows(earned)} />
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

// Beside your header in bands from lg up (under it below lg): what you're reading, with the shelf search on the
// heading's right, then what to start next. With nothing on the go, Up next leads (your header says so in a
// line). While you search, both make way for the results, right under the field: a full-width panel lower
// down would start below your column, however tall it is.
const BooksTop: FC = () => {
  const { user } = useUser()
  const { books } = useBooks()
  const shared = useSharedShelfFilter()
  if (!Array.isArray(books)) return <ReadingNowSkeleton progress heading="w-44" />
  const { reading, finished } = groupShelf(books as Book[])
  const searching = !!shared && (isNarrowed(shared.filter) || shared.filtersOpen)
  return (
    <>
    {/* From lg up your favourites lead this column, above what you're reading; below lg they open the profile
        (`lead`). Out of the way while you search, so the results stay right under the field. */}
    {!searching && <div className="hidden lg:block"><ProfileFavourites /></div>}
    <section aria-labelledby="continue-reading">
      <div className="mb-4 flex min-h-10 items-center justify-between gap-4">
        <h2 id="continue-reading" className="flex items-baseline gap-2 text-lg font-semibold">
          {searching ? "Your shelf" : reading.length > 0 ? <>Continue reading <span className="text-sm font-normal text-muted-foreground tabular-nums">{reading.length}</span></> : "Up next"}
        </h2>
        <ShelfSearch />
      </div>
      {searching ? <BookList slot="results" /> : reading.length > 0
        ? <><ContinueReading books={reading} finished={finished} accentColour={user?.favColour} /><div className="lg:hidden"><UpNext /></div></>
        : <UpNext bare />}
      {/* Nothing on the go and something on the shelf: the first-book picker, which starts with your Want to read
          (BOO-52). An empty shelf has its own card pointing there. */}
      {!searching && reading.length === 0 && books.length > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Can&apos;t decide? <Link href="/first-book" className="font-medium text-foreground underline-offset-4 hover:underline">Help me pick a book</Link>
        </p>
      )}
      {/* From lg up the rest of this column is Up next (three) beside your lists, so they sit beside your reviews
          rather than under them. Below lg they stay bands of their own (OwnerProfile). */}
      {!searching && user && (
        <div className={cn("hidden lg:block", reading.length > 0 ? "mt-8" : "mt-12")}>
          <BandsShowcase username={user.username} column withUpNext={reading.length > 0} />
        </div>
      )}
    </section>
    {/* On a phone your favourites come after what you're reading; from md they're beside your header (`lead`). */}
    {!searching && <div className="mt-12 md:hidden"><ProfileFavourites half /></div>}
    </>
  )
}

// In bands your header becomes a column from lg up, with what you're reading beside it. The goal
// is two lines in that column, or two lines in words under your stats below lg; the authors you follow get a line
// under your bio; the banner is shorter.
const ProfileHead: FC<{ layout?: ProfileLayout }> = ({ layout = 'bands' }) => {
  const bands = layout === 'bands'
  const { user, isError, isLoading, mutate: mutateUser } = useUser()
  const booksReadFor = useBooksReadFor()
  const { books } = useBooks()
  const { achievements, isLoading: achievementsLoading } = useAchievements()
  // Only its counts and medals: your books are on your shelf (useBooks), which comes with the page.
  const { profile } = usePublicProfile(user?.username ?? "", { books: false })
  const editProfileModal = useEditProfileModal()
  const [showLightbox, setShowLightbox] = useState(false)

  // SWR reports isLoading while it revalidates server-provided fallback data too, so check for data.
  if (isLoading && !user) return <ProfileSkeleton own shelves={false} />

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

  return (
    <>
      <ProfileHeader
        username={user.username}
        displayName={user.displayName}
        booksRead={booksReadFor(user.username, booksRead)}
        bio={user.bio}
        links={user.profileLinks}
        image={user.image}
        banner={user.banner}
        colour={user.favColour}
        {...supporterOf(user)}
        staffBadge={staffBadgeOf(user)}
        compact={bands}
        besides={bands ? <BooksTop /> : undefined}
        // From md to lg your favourites sit beside your header. On a phone what you're reading comes first, as it's
        // what you come here to update, and they follow it (BooksTop).
        lead={bands ? <ProfileFavourites half /> : undefined}
        leadOnPhone={false}
        // From lg up the column ends with the ways further in and, under them, your reviews, as on someone else's
        // profile; below lg both are further down the page (OwnerProfile).
        identityFooter={bands ? (
          <>
            <ProfileLinkRows className="mt-8" rows={ownLinkRows(earned)} />
            <div className="mt-10 empty:hidden"><OwnReviews first={BANDS_REVIEWS} /></div>
          </>
        ) : undefined}
        onAvatarClick={user.image ? () => setShowLightbox(true) : undefined}
        stats={[
          { value: booksRead, label: plural(booksRead, "book read", "books read") },
          { value: hideCounts ? null : followers, label: hideCounts ? "Followers" : plural(followers, "follower"), followList: { username: user.username, kind: "followers" } },
          { value: hideCounts ? null : following, label: hideCounts ? "Following" : "following", followList: { username: user.username, kind: "following" } },
        ]}
        share={<ShareProfileButton username={user.username} />}
        // One button: adding a book is in the site header and on your shelf, not beside your name (BOO-97).
        actions={<button type="button" onClick={editProfileModal.onOpen} className={secondaryButtonClass}>Edit profile</button>}
      >
        {/* One line and a thin bar; the month, pages and average are on /stats. */}
        {bands ? <ReadingGoalWidget variant="bar" /> : <ReadingGoalWidget />}
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
