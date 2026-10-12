"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Book } from '@prisma/client'
import axios from 'axios'
import { toast } from 'react-toastify'
import usePublicProfile from '@/app/hooks/usePublicProfile'
import useUser from '@/app/hooks/useUser'
import { Button } from '../ui/button'
import PublicBookCard from './PublicBookCard'
import Loader from '../Loader'

interface PublicProfileProps {
  username: string
}

const PublicProfile: FC<PublicProfileProps> = ({ username }) => {
  const { user } = useUser()
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

  const completedCount = profile.books.filter((b: Book) => b.status === "COMPLETED").length

  return (
    <div className="w-full">
      <div className="h-48 overflow-hidden rounded-[25px] relative">
        {profile.banner ? <Image priority src={profile.banner} layout="fill" objectFit="cover" alt="banner" /> : <div style={{ background: `${profile.favColour || "#f44336"}` }} className="w-full h-full"></div>}
      </div>
      <div className="relative -mt-16 ml-10 size-32 rounded-[50px] border-[5px] border-white dark:border-background overflow-hidden">
        <Image sizes="128px" priority src={profile.image || "/images/avatar.jpg"} alt="avatar" layout="fill" objectFit="cover" className="w-full h-full object-cover" />
      </div>
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mt-6">
        <div className="px-6 md:px-12">
          <h1 className="text-3xl font-bold">{profile.username}</h1>
          <p className="text-sm text-gray-500/85 dark:text-gray-300/90 mt-1 max-w-lg">{profile.bio}</p>
          <div className="mt-4 flex items-center gap-4 text-xs text-slate-600 dark:text-gray-300/90">
            <p><span className="font-bold mr-1">{completedCount}</span>Books Read</p>
            <p><span className="font-bold mr-1">{profile.followerCount}</span>Follower{profile.followerCount === 1 ? "" : "s"}</p>
            <p><span className="font-bold mr-1">{profile.followingCount}</span>Following</p>
          </div>
        </div>
        {!profile.isSelf && (
          <div className="px-6 md:px-12 mt-4 lg:mt-0">
            {user ? (
              <Button disabled={isFollowLoading} style={{ background: profile.isFollowing ? "transparent" : user?.favColour, border: `2px solid ${user?.favColour}`, color: profile.isFollowing ? user?.favColour : "white" }} onClick={handleFollowToggle}>
                {profile.isFollowing ? "Following" : "Follow"}
              </Button>
            ) : (
              <Button asChild style={{ background: profile.favColour || "#f44336" }}>
                <Link href="/register">Sign up to follow</Link>
              </Button>
            )}
          </div>
        )}
      </div>
      <hr className="my-10" />
      {profile.books.length === 0 ? (
        <p className="px-6 md:px-12 text-sm text-muted-foreground">No books on their shelf yet.</p>
      ) : (
        <div className="px-6 md:px-12 grid grid-cols-1 xl:grid-cols-[repeat(auto-fill,275px)] gap-6">
          {profile.books.map((book: Book) => <PublicBookCard key={book.id} book={book} />)}
        </div>
      )}
    </div>
  )
}

export default PublicProfile
