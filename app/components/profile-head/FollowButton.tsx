"use client"
import { FC, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { followButtonLabel } from '@/lib/followRules'
import { primaryButtonClass, secondaryButtonClass } from './ProfileHeader'

interface FollowButtonProps {
  username: string
  initialFollowing: boolean
  // A follow request is waiting on them.
  initialRequested?: boolean
  // Their profile isn't public, so following asks first (lib/followRules.ts).
  needsApproval?: boolean
}

const FollowButton: FC<FollowButtonProps> = ({ username, initialFollowing, initialRequested = false, needsApproval = false }) => {
  const router = useRouter()
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [requested, setRequested] = useState(initialRequested)
  const [isLoading, setIsLoading] = useState(false)

  const toggle = () => {
    setIsLoading(true)
    axios.post(`/api/users/${encodeURIComponent(username)}/follow`)
      .then((res) => {
        setIsFollowing(!!res.data.isFollowing)
        setRequested(!!res.data.requested)
        if (res.data.requested) notify.success(`Asked to follow ${username}. You'll see their profile once they accept.`)
        // Re-renders the server header so the follower count moves too.
        router.refresh()
      })
      .catch(() => {
        // No retry action: the endpoint toggles, so a retry after a request that did land would undo it.
        notify.error(isFollowing ? `Couldn't unfollow ${username}. Try again.` : `Couldn't follow ${username}. Try again.`)
      })
      .finally(() => setIsLoading(false))
  }

  return (
    <button
      type="button"
      disabled={isLoading}
      aria-pressed={isFollowing || requested}
      onClick={toggle}
      title={requested ? "Withdraw your request" : undefined}
      className={isFollowing || requested ? secondaryButtonClass : primaryButtonClass}
    >
      {followButtonLabel({ isFollowing, requested, needsApproval })}
    </button>
  )
}

export default FollowButton
