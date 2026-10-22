import { FC } from 'react'
import Link from 'next/link'
import { Book } from '@prisma/client'
import type { SerializedProfile } from '@/lib/publicProfile'
import ProfileHeader, { primaryButtonClass, type ProfileStat } from './ProfileHeader'
import FollowButton from './FollowButton'
import ShareProfileButton from './ShareProfileButton'
import ProfileMenu from './ProfileMenu'
import ProfileReviews from './ProfileReviews'
import { cn } from '@/lib/utils'
import BookCoverCard from '../cards/BookCoverCard'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { ShelfSection, coverGridClass, groupShelf, isRereading, readingGridCols } from '../books/shelf'
import ProfileLists from '../discover/ProfileLists'
import ProfileQuestMedals from '../quests/ProfileQuestMedals'
import { isFinishedBook } from '@/lib/readerTier'
import ProfileThemeFrame from '../profile/ProfileThemeFrame'

interface PublicProfileProps {
  profile: SerializedProfile
  // null when signed out.
  viewer: { isFollowing: boolean } | null
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

  const actions = (
    <>
      <ShareProfileButton username={profile.username} />
      {viewer
        ? <FollowButton username={profile.username} initialFollowing={viewer.isFollowing} />
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
    <ProfileThemeFrame theme={profile.profileTheme} accent={profile.favColour}>
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
        actions={actions}
        stats={[
          { value: completedCount, label: completedCount === 1 ? "book read" : "books read" },
          ...followStats,
          { value: achievementCount, label: achievementCount === 1 ? "achievement" : "achievements" },
        ]}
      />
      <div className="mt-12 px-4 sm:px-8">
        {reading.length === 0 && finished.length === 0 && wantToRead.length === 0 ? (
          <p className="text-sm text-muted-foreground">No books on their shelf yet.</p>
        ) : (
          <>
            {reading.length > 0 && (
              <ShelfSection id="public-shelf-reading" title="Currently reading" count={reading.length}>
                <div className={cn("grid grid-cols-1 gap-4", readingGridCols(reading.length))}>
                  {reading.map((book) => <CurrentlyReadingCard key={book.id} book={book} accentColour={profile.shelfColour} readOnly isReread={isRereading(book, finished)} />)}
                </div>
              </ShelfSection>
            )}
            {finished.length > 0 && (
              <ShelfSection id="public-shelf-finished" title="Finished" count={finished.length}>
                <div className={coverGridClass}>
                  {finished.map((book) => <BookCoverCard key={book.id} book={book} accentColour={profile.shelfColour} readOnly />)}
                </div>
              </ShelfSection>
            )}
            <ProfileReviews books={profile.books} accentColour={profile.favColour} />
            {wantToRead.length > 0 && (
              <ShelfSection id="public-shelf-want" title="Want to read" count={wantToRead.length}>
                <div className={coverGridClass}>
                  {wantToRead.map((book) => <BookCoverCard key={book.id} book={book} accentColour={profile.shelfColour} readOnly />)}
                </div>
              </ShelfSection>
            )}
          </>
        )}
        <ProfileQuestMedals achievements={profile.achievements} />
        <ProfileLists username={profile.username} isSelf={false} />
      </div>
    </div>
    </ProfileThemeFrame>
  )
}

export default PublicProfile
