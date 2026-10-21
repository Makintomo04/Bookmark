"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { Book } from '@prisma/client'
import axios from 'axios'
import { toast } from 'react-toastify'
import usePublicProfile from '@/app/hooks/usePublicProfile'
import useUser from '@/app/hooks/useUser'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import Loader from '../Loader'
import ProfileHeader, { primaryButtonClass, secondaryButtonClass } from './ProfileHeader'
import { cn } from '@/lib/utils'
import BookCoverCard from '../cards/BookCoverCard'
import CurrentlyReadingCard from '../cards/CurrentlyReadingCard'
import { ShelfSection, coverGridClass, groupShelf, isRereading, readingGridCols } from '../books/shelf'

interface PublicProfileProps {
  username: string
}

const PublicProfile: FC<PublicProfileProps> = ({ username }) => {
  const { user } = useUser()
  const booksReadFor = useBooksReadFor()
  const { profile, isLoading, mutate } = usePublicProfile(username)
  const [isFollowLoading, setIsFollowLoading] = useState(false)

  if (isLoading) return <Loader />
  if (!profile || profile.error) return <p className="px-6 md:px-12">This user couldn&apos;t be found.</p>

  const handleFollowToggle = () => {
    setIsFollowLoading(true)
    axios.post(`/api/users/${encodeURIComponent(username)}/follow`)
      .then((res) => {
        toast.success(res.data.isFollowing ? `Following ${profile.username}!` : `Unfollowed ${profile.username}.`, { position: "bottom-center" })
        mutate()
      })
      .catch(() => {
        toast.error("Something went wrong.", { position: "bottom-center" })
      })
      .finally(() => setIsFollowLoading(false))
  }

  const { reading, finished } = groupShelf(profile.books as Book[])
  const completedCount = finished.length

  const achievementCount = profile.achievements?.length ?? 0
  const followAction = profile.isSelf ? null : user ? (
    <button
      type="button"
      disabled={isFollowLoading}
      aria-pressed={profile.isFollowing}
      onClick={handleFollowToggle}
      className={profile.isFollowing ? secondaryButtonClass : primaryButtonClass}
    >
      {profile.isFollowing ? "Following" : "Follow"}
    </button>
  ) : (
    <Link href="/register" className={primaryButtonClass}>Sign up to follow</Link>
  )

  return (
    <div className="w-full">
      <ProfileHeader
        username={profile.username}
        booksRead={booksReadFor(profile.username, completedCount)}
        bio={profile.bio}
        image={profile.image}
        banner={profile.banner}
        colour={profile.favColour}
        actions={followAction}
        stats={[
          { value: completedCount, label: completedCount === 1 ? "book read" : "books read" },
          { value: profile.followerCount, label: profile.followerCount === 1 ? "follower" : "followers" },
          { value: profile.followingCount, label: "following" },
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
      </div>
    </div>
  )
}

export default PublicProfile
