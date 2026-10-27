import { FC } from 'react'
import Link from 'next/link'
import { Book } from '@prisma/client'
import type { SerializedProfile } from '@/lib/publicProfile'
import ProfileHeader, { primaryButtonClass, type ProfileStat } from './ProfileHeader'
import FollowButton from './FollowButton'
import ShareProfileButton from './ShareProfileButton'
import ProfileMenu from './ProfileMenu'
import ProfileReviews from './ProfileReviews'
import BooksInCommon from './BooksInCommon'
import { cn } from '@/lib/utils'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { ShelfSection, groupShelf, isRereading, readingGridCols } from '../books/shelf'
import CappedShelf from './CappedShelf'
import { shelfPageHref } from '@/lib/shelfFilter'
import ProfileLists from '../discover/ProfileLists'
import ProfileAuthors from './ProfileAuthors'
import MedalShowcase from '../achievements/MedalShowcase'
import { isFinishedBook } from '@/lib/readerTier'

interface PublicProfileProps {
  profile: SerializedProfile
  // null when signed out.
  viewer: { isFollowing: boolean; requested: boolean; needsApproval: boolean } | null
}

// Someone else's profile, rendered on the server. Following, sharing, the follow lists
// and the profile's reading lists are client islands. The payload is already filtered for
// this viewer (lib/publicProfile.ts): hidden shelves, reviews and counts never arrive.
const PublicProfile: FC<PublicProfileProps> = ({ profile, viewer }) => {
  // The cards take a Book; the public payload is the subset of it they read.
  const { reading, finished, wantToRead } = groupShelf(profile.books as unknown as Book[])
  // Re-reads sit under Currently reading but still count as read.
  const completedCount = profile.books.filter(isFinishedBook).length
  const achievementCount = profile.achievements.length
  const achievementsHref = `/u/${encodeURIComponent(profile.username)}/achievements`

  const actions = (
    <>
      <ShareProfileButton username={profile.username} />
      {viewer
        ? <FollowButton username={profile.username} initialFollowing={viewer.isFollowing} initialRequested={viewer.requested} needsApproval={viewer.needsApproval} />
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
        booksRead={completedCount}
        bio={profile.bio}
        image={profile.image}
        banner={profile.banner}
        colour={profile.favColour}
        supporter={profile.supporter}
        founding={profile.founding}
        badge={profile.badge}
        staffBadge={profile.staffBadge}
        actions={actions}
        stats={[
          { value: completedCount, label: completedCount === 1 ? "book read" : "books read" },
          ...followStats,
          { value: achievementCount, label: achievementCount === 1 ? "achievement" : "achievements", href: achievementsHref },
        ]}
      >
        <MedalShowcase earned={profile.achievements} href={achievementsHref} />
      </ProfileHeader>
      <div className="mt-12 px-4 sm:px-8">
        {viewer && <BooksInCommon username={profile.username} accentColour={profile.favColour} />}
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
            <ProfileReviews books={profile.books} accentColour={profile.favColour} canReport />
            {wantToRead.length > 0 && (
              <CappedShelf id="public-shelf-want" title="Want to read" books={wantToRead} accentColour={profile.favColour} href={shelfPageHref(profile.username, "want")} />
            )}
          </>
        )}
        <ProfileLists username={profile.username} isSelf={false} />
        <div className="mt-12"><ProfileAuthors authors={profile.followedAuthors} /></div>
      </div>
    </div>
  )
}

export default PublicProfile
