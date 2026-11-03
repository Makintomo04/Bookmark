import { FC } from 'react'
import { Book } from '@prisma/client'
import type { SerializedPreview } from '@/lib/publicProfile'
import { readerName } from '@/lib/profile'
import ProfileHeader, { type ProfileStat } from './ProfileHeader'
import FollowButton from './FollowButton'
import JoinToFollow from './JoinToFollow'
import WelcomeBack from './WelcomeBack'
import ShareProfileButton from './ShareProfileButton'
import ProfileMenu from './ProfileMenu'
import ProfileReviews from './ProfileReviews'
import { cn } from '@/lib/utils'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { ShelfSection, groupShelf, isRereading, readingGridCols } from '../books/shelf'
import CappedShelf from './CappedShelf'
import ProfileShowcase from './ProfileShowcase'
import { shelfPageHref } from '@/lib/shelfFilter'
import ProfileAuthors from './ProfileAuthors'
import PublicShelves from './PublicShelves'
import { BANDS_REVIEWS, SECTIONS, type ProfileLayout } from './Band'
import ContinueReading from './ContinueReading'
import ProfileLinkRows from './ProfileLinkRows'
import type { SharedCircle } from '@/lib/sharedCircles'
import FavouritesRow from './FavouritesRow'
import ProfileLists from '../discover/ProfileLists'

interface PublicProfileProps {
  // Previews of their shelves and reviews, with the counts (profilePreview).
  profile: SerializedPreview
  // null when signed out.
  // followsYou: they follow the viewer, so the button can say "Follow back" or "Friends" (lib/followRules.ts).
  viewer: { isFollowing: boolean; requested: boolean; needsApproval: boolean; followsYou: boolean } | null
  layout?: ProfileLayout
  // The reading circles the viewer shares with them (lib/sharedCircles.ts), pinned first on their reading cards.
  sharedCircles?: SharedCircle[]
  // They have lists this viewer can see. Lists load in the browser, so the server says whether there are any.
  hasLists?: boolean
  // The viewer has just joined from this profile (?joined=1, JoinToFollow): welcome them and offer Follow.
  justJoined?: boolean
}

// How many followed authors show in bands before "+N more".
const BANDS_AUTHORS = 8

// Someone else's profile, rendered on the server. Following, sharing, the follow lists
// and the profile's reading lists are client islands. The payload is already filtered for
// this viewer (lib/publicProfile.ts): hidden shelves, reviews and counts never arrive. It carries the newest
// of each shelf and of their reviews, and the counts; the rest loads when the viewer asks for it.
const PublicProfile: FC<PublicProfileProps> = ({ profile, viewer, layout = 'bands', sharedCircles = [], hasLists = true, justJoined = false }) => {
  const bands = layout === 'bands'
  const name = readerName(profile)
  const { reviewCount, shelfCounts } = profile
  const favourites = profile.favourites as unknown as Book[]
  const achievementsHref = `/u/${encodeURIComponent(profile.username)}/achievements`
  // The cards take a Book; the public payload is the subset of it they read.
  const { reading, finished, wantToRead } = groupShelf(profile.books as unknown as Book[])
  // The shelves, as tabs.
  const shelves = shelfCounts.finished === 0 && shelfCounts.want === 0 && reading.length === 0 ? (
    <p className="text-sm text-muted-foreground">No books on their shelf yet.</p>
  ) : (
    <PublicShelves username={profile.username} wantToRead={wantToRead} finished={finished} counts={shelfCounts} accentColour={profile.favColour} />
  )
  // In bands, beside the header from lg up (under it below lg): their favourites first, as they say most about
  // who this reader is, then what they're reading (a circle you share first), their lists, and their shelves to
  // end the column. Below lg the favourites open the profile from the header instead (`lead`), so they're still
  // first.
  const besides = (
    <div className="flex flex-col gap-10">
      {favourites.length > 0 && <div className="hidden lg:block"><FavouritesRow books={favourites} href={`/u/${encodeURIComponent(profile.username)}/favourites`} readOnly half /></div>}
      {reading.length > 0 && (
        <section aria-labelledby="public-now">
          <h2 id="public-now" className="mb-4 flex min-h-10 items-baseline gap-2 text-lg font-semibold">
            Reading now <span className="text-sm font-normal text-muted-foreground tabular-nums">{reading.length}</span>
          </h2>
          <ContinueReading books={reading} finished={finished} accentColour={profile.favColour} readOnly oneLineOnPhone shared={sharedCircles} />
        </section>
      )}
      {hasLists && <div className="empty:hidden"><ProfileLists username={profile.username} isSelf={false} flush swipe /></div>}
      <div className="border-t border-neutral-200 pt-10 first:border-t-0 first:pt-0 dark:border-neutral-800">{shelves}</div>
    </div>
  )
  // Re-reads sit under Currently reading but still count as read.
  const completedCount = profile.booksRead
  const achievementCount = profile.achievements.length
  const linkRows = [{ label: "Achievements", href: achievementsHref, count: achievementCount }]

  // Signed out, the same Follow button, which asks them to join (JoinToFollow).
  const actions = viewer ? (
    <>
      <FollowButton username={profile.username} initialFollowing={viewer.isFollowing} initialRequested={viewer.requested} needsApproval={viewer.needsApproval} followsYou={viewer.followsYou} />
      <ProfileMenu username={profile.username} isBlocked={false} />
    </>
  ) : <JoinToFollow username={profile.username} name={name} />

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
        links={profile.profileLinks}
        image={profile.image}
        banner={profile.banner}
        colour={profile.favColour}
        supporter={profile.supporter}
        founding={profile.founding}
        badge={profile.badge}
        staffBadge={profile.staffBadge}
        compact={bands}
        besides={bands ? besides : undefined}
        // Below lg their favourites open the profile: beside the header from md, under it on a phone.
        lead={bands && favourites.length > 0 ? <FavouritesRow books={favourites} href={`/u/${encodeURIComponent(profile.username)}/favourites`} readOnly half /> : undefined}
        // From lg up the column ends with their reviews, then the way to their achievements; below lg both are further down.
        identityFooter={bands ? (
          <div className="mt-10 flex flex-col gap-8">
            {reviewCount > 0 && <ProfileReviews books={profile.books} total={reviewCount} accentColour={profile.favColour} first={BANDS_REVIEWS} href={`/u/${encodeURIComponent(profile.username)}/reviews`} />}
            <ProfileLinkRows rows={linkRows} />
          </div>
        ) : undefined}
        share={<ShareProfileButton username={profile.username} />}
        actions={actions}
        stats={[
          ...(profile.finishedShown === false ? [] : [{ value: completedCount, label: completedCount === 1 ? "book read" : "books read" }]),
          // Only reviews this viewer may read arrive, so none (or all hidden) leaves the stat out.
          ...followStats,
        ]}
      >
        {viewer && justJoined && !viewer.isFollowing && <WelcomeBack username={profile.username} name={name} />}
      </ProfileHeader>
      {bands ? (
        // In bands, what they're reading, favourites, lists and shelves sit beside the header (besides, above); then,
        // each under a hairline: below lg their reviews, the authors they follow, and below lg the way to their achievements.
        <div className={SECTIONS}>
          {reviewCount > 0 && <div className="lg:hidden"><ProfileReviews books={profile.books} total={reviewCount} accentColour={profile.favColour} first={BANDS_REVIEWS} href={`/u/${encodeURIComponent(profile.username)}/reviews`} /></div>}
          <div className="empty:hidden"><ProfileAuthors authors={profile.followedAuthors} cap={BANDS_AUTHORS} /></div>
          <div className="lg:hidden"><ProfileLinkRows className="!border-t-0" rows={linkRows} /></div>
        </div>
      ) : (
      <div className="mt-8">
        <ProfileShowcase username={profile.username} favourites={profile.favourites as unknown as Book[]} />
        {reading.length === 0 && shelfCounts.finished === 0 && shelfCounts.want === 0 ? (
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
            {shelfCounts.finished > 0 && (
              <CappedShelf id="public-shelf-finished" title="Finished" books={finished} count={shelfCounts.finished} accentColour={profile.favColour} href={shelfPageHref(profile.username, "finished")} />
            )}
            {shelfCounts.want > 0 && (
              <CappedShelf id="public-shelf-want" title="Want to read" books={wantToRead} count={shelfCounts.want} accentColour={profile.favColour} href={shelfPageHref(profile.username, "want")} />
            )}
            <ProfileReviews books={profile.books} total={reviewCount} accentColour={profile.favColour} href={`/u/${encodeURIComponent(profile.username)}/reviews`} />
          </>
        )}
        <div className="mt-12"><ProfileAuthors authors={profile.followedAuthors} /></div>
      </div>
      )}
    </div>
  )
}

export default PublicProfile
