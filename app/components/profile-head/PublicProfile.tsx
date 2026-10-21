import { FC } from 'react'
import Link from 'next/link'
import { Book } from '@prisma/client'
import type { SerializedProfile } from '@/lib/publicProfile'
import ProfileHeader, { primaryButtonClass } from './ProfileHeader'
import FollowButton from './FollowButton'
import ShareProfileButton from './ShareProfileButton'
import { cn } from '@/lib/utils'
import BookCoverCard from '../cards/BookCoverCard'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { ShelfSection, coverGridClass, groupShelf, isRereading, readingGridCols } from '../books/shelf'
import ProfileLists from '../discover/ProfileLists'

interface PublicProfileProps {
  profile: SerializedProfile
  // null when signed out.
  viewer: { isFollowing: boolean } | null
}

// Someone else's profile, rendered on the server. Following, sharing, the follow lists
// and the profile's reading lists are client islands.
const PublicProfile: FC<PublicProfileProps> = ({ profile, viewer }) => {
  // The cards take a Book; the public payload is the subset of it they read.
  const { reading, finished } = groupShelf(profile.books as unknown as Book[])
  const completedCount = finished.length
  const achievementCount = profile.achievements.length

  const actions = (
    <>
      <ShareProfileButton username={profile.username} />
      {viewer
        ? <FollowButton username={profile.username} initialFollowing={viewer.isFollowing} />
        : <Link href="/register" className={primaryButtonClass}>Sign up to follow</Link>}
    </>
  )

  return (
    <div className="w-full">
      <ProfileHeader
        username={profile.username}
        booksRead={completedCount}
        bio={profile.bio}
        image={profile.image}
        banner={profile.banner}
        colour={profile.favColour}
        actions={actions}
        stats={[
          { value: completedCount, label: completedCount === 1 ? "book read" : "books read" },
          { value: profile.followerCount, label: profile.followerCount === 1 ? "follower" : "followers", followList: { username: profile.username, kind: "followers" } },
          { value: profile.followingCount, label: "following", followList: { username: profile.username, kind: "following" } },
          { value: achievementCount, label: achievementCount === 1 ? "achievement" : "achievements" },
        ]}
      />
      <div className="mt-12 px-4 sm:px-8">
        {reading.length === 0 && finished.length === 0 ? (
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
              <ShelfSection id="public-shelf-finished" title="Finished" count={finished.length}>
                <div className={coverGridClass}>
                  {finished.map((book) => <BookCoverCard key={book.id} book={book} accentColour={profile.favColour} readOnly />)}
                </div>
              </ShelfSection>
            )}
          </>
        )}
        <ProfileLists username={profile.username} isSelf={false} />
      </div>
    </div>
  )
}

export default PublicProfile
