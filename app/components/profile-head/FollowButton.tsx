"use client"
import { FC, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { toast } from 'react-toastify'
import { primaryButtonClass, secondaryButtonClass } from './ProfileHeader'

interface FollowButtonProps {
  username: string
  initialFollowing: boolean
}

const FollowButton: FC<FollowButtonProps> = ({ username, initialFollowing }) => {
  const router = useRouter()
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [isLoading, setIsLoading] = useState(false)

  const toggle = () => {
    setIsLoading(true)
    axios.post(`/api/users/${encodeURIComponent(username)}/follow`)
      .then((res) => {
        setIsFollowing(res.data.isFollowing)
        toast.success(res.data.isFollowing ? `Following ${username}!` : `Unfollowed ${username}.`, { position: "bottom-center" })
        // Re-renders the server header so the follower count moves too.
        router.refresh()
      })
      .catch(() => {
        toast.error("Something went wrong.", { position: "bottom-center" })
      })
      .finally(() => setIsLoading(false))
  }

  return (
    <button
      type="button"
      disabled={isLoading}
      aria-pressed={isFollowing}
      onClick={toggle}
      className={isFollowing ? secondaryButtonClass : primaryButtonClass}
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  )
}

export default FollowButton
