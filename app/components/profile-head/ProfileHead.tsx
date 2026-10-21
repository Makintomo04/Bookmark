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

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

const ProfileHead: FC = () => {
  const { user, isError, isLoading } = useUser()
  const booksReadFor = useBooksReadFor()
  const { books } = useBooks()
  const { favourites } = useFavourite()
  const { achievements } = useAchievements()
  const { profile } = usePublicProfile(user?.username ?? "")
  const bookEntryModal = useBookEntryModal()
  const editProfileModal = useEditProfileModal()
  const [showLightbox, setShowLightbox] = useState(false)

  if (isLoading) {
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
    return <p>Couldn&apos;t load your profile. Try refreshing the page.</p>
  }

  const booksRead = books?.filter((book: Book) => book.status === "COMPLETED").length ?? 0
  const earned = achievements.flatMap((a) => a.milestones).filter((m) => m.earned).length
  const followers = profile?.followerCount ?? 0
  const following = profile?.followingCount ?? 0

  return (
    <>
      <ProfileHeader
        username={user.username}
        booksRead={booksReadFor(user.username, booksRead)}
        bio={user.bio}
        image={user.image}
        banner={user.banner}
        colour={user.favColour}
        onAvatarClick={() => setShowLightbox(true)}
        stats={[
          { value: booksRead, label: plural(booksRead, "book read", "books read") },
          { value: followers, label: plural(followers, "follower") },
          { value: following, label: "following" },
          { value: favourites.length, label: plural(favourites.length, "favourite"), href: "/favourites" },
          { value: earned, label: plural(earned, "achievement"), href: "/achievements" },
        ]}
        actions={
          <>
            <button type="button" onClick={editProfileModal.onOpen} className={secondaryButtonClass}>Edit profile</button>
            <button type="button" onClick={() => bookEntryModal.onOpen()} className={primaryButtonClass}>
              <Plus size={16} aria-hidden />Add a book
            </button>
          </>
        }
      >
        <ReadingGoalWidget />
      </ProfileHeader>

      {showLightbox && (
        <Lightbox
          small={user.image || "/images/avatar.jpg"}
          large={user.image || "/images/avatar.jpg"}
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
