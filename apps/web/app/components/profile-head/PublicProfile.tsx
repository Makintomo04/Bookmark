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
import PublicShelves from './PublicShelves'
import { isFinishedBook } from '@/lib/readerTier'
import { type ProfileLayout } from './Band'
import ContinueReading from './ContinueReading'
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
  // They have lists this viewer can see. Lists load in the browser, so the server says whether there are any.
  hasLists?: boolean
}

// How many reviews and followed authors show in bands before "Show more" and "+N more".
const BANDS_REVIEWS = 3
const BANDS_AUTHORS = 8

// Someone else's profile, rendered on the server. Following, sharing, the follow lists
// and the profile's reading lists are client islands. The payload is already filtered for
// this viewer (lib/publicProfile.ts): hidden shelves, reviews and counts never arrive.
const PublicProfile: FC<PublicProfileProps> = ({ profile, viewer, layout = 'bands', sharedCircles = [], goal = null, hasLists = true }) => {
  const bands = layout === 'bands'
  const favourites = profile.favourites as unknown as Book[]
  const achievementsHref = `/u/${encodeURIComponent(profile.username)}/achievements`
  // The cards take a Book; the public payload is the subset of it they read.
  const { reading, finished, wantToRead } = groupShelf(profile.books as unknown as Book[])
  // The shelves, as tabs.
  const shelves = finished.length === 0 && wantToRead.length === 0 && reading.length === 0 ? (
    <p className="text-sm text-muted-foreground">No books on their shelf yet.</p>
  ) : (
    <PublicShelves wantToRead={wantToRead} finished={finished} accentColour={profile.favColour} />
  )
  // With nothing to put beside the header (no reading, favourites or lists), the shelves take that space rather
  // than leaving it empty, and nothing sits under the header.
  const shelvesBeside = reading.length === 0 && favourites.length === 0 && !hasLists
  // In bands, everything but the shelves sits beside the header from lg up, in the order a phone shows it:
  // what they're reading (a circle you share first), favourites, lists, then reviews and the authors they follow
  // below lg (from lg up they end the header's column). A short column of cards never leaves the rest of the page empty beside it.
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
      {hasLists && <div className="empty:hidden"><ProfileLists username={profile.username} isSelf={false} flush swipe /></div>}
      {/* Below lg these follow the lists; from lg up they end the header's column (identityFooter, below). */}
      <div className="flex flex-col gap-12 lg:hidden empty:hidden">
        <div className="empty:hidden"><ProfileReviews books={profile.books} accentColour={profile.favColour} first={BANDS_REVIEWS} href={`/u/${encodeURIComponent(profile.username)}/reviews`} /></div>
        <div className="empty:hidden"><ProfileAuthors authors={profile.followedAuthors} cap={BANDS_AUTHORS} /></div>
      </div>
      {shelvesBeside && <div className="empty:hidden">{shelves}</div>}
    </div>
  )
  // Re-reads sit under Currently reading but still count as read.
  const completedCount = profile.books.filter(isFinishedBook).length
  const achievementCount = profile.achievements.length
  const reviewCount = reviewedBooks(profile.books).length

  const actions = (
    <>
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
        besides={bands ? besides : undefined}
        // From lg up the column ends with their reviews, the authors they follow, then their top medals, as on your own profile.
        identityFooter={bands ? (
          <div className="flex flex-col gap-8 pt-8">
            <div className="empty:hidden"><ProfileReviews books={profile.books} accentColour={profile.favColour} first={BANDS_REVIEWS} href={`/u/${encodeURIComponent(profile.username)}/reviews`} /></div>
            <div className="empty:hidden"><ProfileAuthors authors={profile.followedAuthors} cap={BANDS_AUTHORS} /></div>
            <div className="[&>section]:!mt-0"><MedalShowcase earned={profile.achievements} href={achievementsHref} stacked /></div>
          </div>
        ) : undefined}
        share={<ShareProfileButton username={profile.username} />}
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
        // In bands, everything else sits beside the header (besides, above), so this is the shelves, unless
        // they've taken the space beside it.
        !shelvesBeside && <div className="mt-12 flex flex-col gap-12">{shelves}</div>
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
            <ProfileReviews books={profile.books} accentColour={profile.favColour} href={`/u/${encodeURIComponent(profile.username)}/reviews`} />
          </>
        )}
        <div className="mt-12"><ProfileAuthors authors={profile.followedAuthors} /></div>
      </div>
      )}
    </div>
  )
}

export default PublicProfile
