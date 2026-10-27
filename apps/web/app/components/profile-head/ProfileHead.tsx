"use client"
import { FC, useState } from 'react'
import { Lightbox } from "react-modal-image"
import { Book } from '@prisma/client'
import { Plus } from 'lucide-react'
import useUser from '@/app/hooks/useUser'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import useBooks from '@/app/hooks/useBooks'
import useFavourite from '@/app/hooks/useFavourite'
import useAchievements from '@/app/hooks/useAchievements'
import usePublicProfile from '@/app/hooks/usePublicProfile'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import useEditProfileModal from '@/app/hooks/useEditProfileModal'
import { Skeleton } from '../ui/skeleton'
import ProfileHeader, { primaryButtonClass, secondaryButtonClass } from './ProfileHeader'
import ReadingGoalWidget from './ReadingGoalWidget'
import ShareProfileButton from './ShareProfileButton'
import FetchErrorState from '../FetchErrorState'
import { isFinishedBook } from '@/lib/readerTier'
import { resolveBanner } from '@/lib/banners'
import { supporterOf } from '@/lib/supporter'
import { staffBadgeOf } from '@/lib/staffBadge'
import { milestoneKey, type AchievementKey } from '@/lib/achievements-catalog'

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

const ProfileHead: FC = () => {
  const { user, isError, isLoading, mutate: mutateUser } = useUser()
  const booksReadFor = useBooksReadFor()
  const { books } = useBooks()
  const { favourites } = useFavourite()
  const { achievements, isLoading: achievementsLoading } = useAchievements()
  const { profile } = usePublicProfile(user?.username ?? "")
  const bookEntryModal = useBookEntryModal()
  const editProfileModal = useEditProfileModal()
  const [showLightbox, setShowLightbox] = useState(false)

  // SWR reports isLoading while it revalidates server-provided fallback data too, so check for data.
  if (isLoading && !user) {
    return (
      <div>
        <Skeleton className="h-20 sm:h-28 w-full rounded-2xl" />
        <div className="px-4 sm:px-8">
          <Skeleton className="-mt-12 sm:-mt-14 size-24 sm:size-28 rounded-[32px] border-4 border-background" />
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

  return (
    <>
      <ProfileHeader
        username={user.username}
        booksRead={booksReadFor(user.username, booksRead)}
        bio={user.bio}
        image={user.image}
        banner={resolveBanner(user.banner, user.id)}
        colour={user.favColour}
        {...supporterOf(user)}
        staffBadge={staffBadgeOf(user)}
        onAvatarClick={user.image ? () => setShowLightbox(true) : undefined}
        stats={[
          { value: booksRead, label: plural(booksRead, "book read", "books read") },
          { value: hideCounts ? null : followers, label: hideCounts ? "Followers" : plural(followers, "follower"), followList: { username: user.username, kind: "followers" } },
          { value: hideCounts ? null : following, label: hideCounts ? "Following" : "following", followList: { username: user.username, kind: "following" } },
          { value: favourites.length, label: plural(favourites.length, "favourite"), href: "/favourites" },
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
        <ReadingGoalWidget />
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
