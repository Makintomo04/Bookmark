import { FC } from 'react'
import Link from 'next/link'
import { Book } from '@prisma/client'
import type { SerializedProfile } from '@/lib/publicProfile'
import ProfileHeader, { primaryButtonClass, type ProfileStat } from './ProfileHeader'
import FollowButton from './FollowButton'
import ShareProfileButton from './ShareProfileButton'
import ProfileMenu from './ProfileMenu'
import ProfileReviews from './ProfileReviews'
import { reviewedBooks } from '@/lib/reviewedBooks'
import { cn } from '@/lib/utils'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { ShelfSection, groupShelf, isRereading, readingGridCols } from '../books/shelf'
import CappedShelf from './CappedShelf'
import ProfileShowcase from './ProfileShowcase'
import { shelfPageHref } from '@/lib/shelfFilter'
import ProfileAuthors from './ProfileAuthors'
import { isFinishedBook } from '@/lib/readerTier'
import Band, { type ProfileLayout } from './Band'
import ContinueReading from './ContinueReading'
import GapFiller from './GapFiller'
import MedalShowcase from '../achievements/MedalShowcase'
import type { SharedCircle } from '@/lib/sharedCircles'
import type { PublicGoal } from '@/lib/publicGoal'
import FavouritesRow from './FavouritesRow'
import ProfileLists from '../discover/ProfileLists'

interface PublicProfileProps {
  profile: SerializedProfile
  // null when signed out.
  // followsYou: they follow the viewer, so the button can say "Follow back" or "Friends" (lib/followRules.ts).
  viewer: { isFollowing: boolean; requested: boolean; needsApproval: boolean; followsYou: boolean } | null
  layout?: ProfileLayout
  // The reading circles the viewer shares with them (lib/sharedCircles.ts), pinned first on their reading cards.
  sharedCircles?: SharedCircle[]
  // This year's goal, when they've chosen to show it (lib/publicGoal.ts).
  goal?: PublicGoal | null
}

// How many reviews and followed authors show in bands before "Show more" and "+N more".
const BANDS_REVIEWS = 3
const BANDS_AUTHORS = 8

// Someone else's profile, rendered on the server. Following, sharing, the follow lists
// and the profile's reading lists are client islands. The payload is already filtered for
// this viewer (lib/publicProfile.ts): hidden shelves, reviews and counts never arrive.
const PublicProfile: FC<PublicProfileProps> = ({ profile, viewer, layout = 'bands', sharedCircles = [], goal = null }) => {
  const bands = layout === 'bands'
  const favourites = profile.favourites as unknown as Book[]
  const achievementsHref = `/u/${encodeURIComponent(profile.username)}/achievements`
  // The cards take a Book; the public payload is the subset of it they read.
  const { reading, finished, wantToRead } = groupShelf(profile.books as unknown as Book[])
  // In bands, everything but the shelves sits beside the header from lg up, in the order a phone shows it:
  // what they're reading (a circle you share first), favourites, lists, then reviews beside the authors they
  // follow. A short column of cards never leaves the rest of the page empty beside it.
  const besides = (
    <div className="flex flex-col gap-10">
      {reading.length > 0 && (
        <section aria-labelledby="public-now">
          <h2 id="public-now" className="mb-4 flex min-h-10 items-baseline gap-2 text-lg font-semibold max-sm:sr-only">
            Reading now <span className="text-sm font-normal text-muted-foreground tabular-nums">{reading.length}</span>
          </h2>
          <ContinueReading books={reading} finished={finished} accentColour={profile.favColour} readOnly oneLineOnPhone shared={sharedCircles} />
        </section>
      )}
      <FavouritesRow books={favourites} href={`/u/${encodeURIComponent(profile.username)}/favourites`} readOnly half />
      <div className="empty:hidden"><ProfileLists username={profile.username} isSelf={false} flush swipe /></div>
      <Band
        wide={<ProfileReviews books={profile.books} accentColour={profile.favColour} canReport first={BANDS_REVIEWS} href={`/u/${encodeURIComponent(profile.username)}/reviews`} />}
        narrow={<ProfileAuthors authors={profile.followedAuthors} cap={BANDS_AUTHORS} />} />
    </div>
  )
  // Re-reads sit under Currently reading but still count as read.
  const completedCount = profile.books.filter(isFinishedBook).length
  const achievementCount = profile.achievements.length
  const reviewCount = reviewedBooks(profile.books).length

  const actions = (
    <>
      <ShareProfileButton username={profile.username} />
      {viewer
        ? <FollowButton username={profile.username} initialFollowing={viewer.isFollowing} initialRequested={viewer.requested} needsApproval={viewer.needsApproval} followsYou={viewer.followsYou} />
        : <Link href="/register" className={primaryButtonClass}>Sign up to follow</Link>}
      {viewer && <ProfileMenu username={profile.username} isBlocked={false} />}
    </>
  )

  // Counts come as null when the reader hides them (calm social).
  const followStats: ProfileStat[] = profile.followerCount === null || profile.followingCount === null ? [] : [
    { value: profile.followerCount, label: profile.followerCount === 1 ? "follower" : "followers", followList: { username: profile.username, kind: "followers" } },
    { value: profile.followingCount, label: "following", followList: { username: profile.username, kind: "following" } },
  ]

  return (
    <div className="w-full">
      <ProfileHeader
        username={profile.username}
        displayName={profile.displayName}
        booksRead={completedCount}
        bio={profile.bio}
        image={profile.image}
        banner={profile.banner}
        colour={profile.favColour}
        supporter={profile.supporter}
        founding={profile.founding}
        badge={profile.badge}
        staffBadge={profile.staffBadge}
        compact={bands}
        follows={bands ? profile.followedAuthors : undefined}
        besides={bands ? besides : undefined}
        identityFooter={bands ? <GapFiller><MedalShowcase earned={profile.achievements} href={achievementsHref} stacked /></GapFiller> : undefined}
        actions={actions}
        stats={[
          { value: completedCount, label: completedCount === 1 ? "book read" : "books read" },
          // Only reviews this viewer may read arrive, so none (or all hidden) leaves the stat out.
          ...(reviewCount > 0 ? [{ value: reviewCount, label: reviewCount === 1 ? "review" : "reviews", href: `/u/${encodeURIComponent(profile.username)}/reviews` }] : []),
          ...followStats,
          { value: achievementCount, label: achievementCount === 1 ? "achievement" : "achievements", href: achievementsHref },
        ]}
      >
        {bands && goal && (
          // Only the count, and how far ahead when they are: a profile never says someone is behind.
          <p className="mt-3 text-sm tabular-nums">
            <span className="font-medium">{goal.books} of {goal.target}</span> books in {goal.year}
            {goal.ahead > 0 && <span className="text-emerald-600 dark:text-emerald-400"> · {goal.ahead} ahead</span>}
            {goal.books >= goal.target && <span className="text-emerald-600 dark:text-emerald-400"> · goal reached</span>}
          </p>
        )}
        {bands && reading.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Not reading anything right now.</p>}
      </ProfileHeader>
      {bands ? (
        // In bands (Iterations 2 to 4): everything else sits beside the header (besides, above), so this is
        // the shelves, in the owner's order.
        <div className="mt-12 flex flex-col gap-12">
          {finished.length === 0 && wantToRead.length === 0 && reading.length === 0 ? (
            <p className="text-sm text-muted-foreground">No books on their shelf yet.</p>
          ) : (
            <div className="[&>*:first-child]:mt-0">
              {wantToRead.length > 0 && (
                <CappedShelf id="public-shelf-want" title="Want to read" books={wantToRead} accentColour={profile.favColour} href={shelfPageHref(profile.username, "want")} />
              )}
              {finished.length > 0 && (
                <CappedShelf id="public-shelf-finished" title="Finished" books={finished} accentColour={profile.favColour} href={shelfPageHref(profile.username, "finished")} />
              )}
            </div>
          )}
        </div>
      ) : (
      <div className="mt-8">
        <ProfileShowcase username={profile.username} favourites={profile.favourites as unknown as Book[]} />
        {reading.length === 0 && finished.length === 0 && wantToRead.length === 0 ? (
          <p className="text-sm text-muted-foreground">No books on their shelf yet.</p>
        ) : (
          <>
            {reading.length > 0 && (
              <ShelfSection id="public-shelf-reading" title="Currently reading" count={reading.length}>
                <div className={cn("grid grid-cols-1 gap-4", readingGridCols(reading.length))}>
                  {reading.map((book) => <CurrentlyReadingCard key={book.id} book={book} accentColour={profile.favColour} readOnly isReread={isRereading(book, finished)} />)}
                </div>
              </ShelfSection>
            )}
            {finished.length > 0 && (
              <CappedShelf id="public-shelf-finished" title="Finished" books={finished} accentColour={profile.favColour} href={shelfPageHref(profile.username, "finished")} />
            )}
            {wantToRead.length > 0 && (
              <CappedShelf id="public-shelf-want" title="Want to read" books={wantToRead} accentColour={profile.favColour} href={shelfPageHref(profile.username, "want")} />
            )}
            <ProfileReviews books={profile.books} accentColour={profile.favColour} canReport href={`/u/${encodeURIComponent(profile.username)}/reviews`} />
          </>
        )}
        <div className="mt-12"><ProfileAuthors authors={profile.followedAuthors} /></div>
      </div>
      )}
    </div>
  )
}

export default PublicProfile
