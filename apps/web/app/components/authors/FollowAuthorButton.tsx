"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'

interface FollowAuthorButtonProps {
  slug: string
  name: string
  initialFollowing: boolean
  signedIn: boolean
}

// Follow / Following on an author page. Free for every reader. Signed out, it goes to sign-in and back.
const FollowAuthorButton: FC<FollowAuthorButtonProps> = ({ slug, name, initialFollowing, signedIn }) => {
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [isLoading, setIsLoading] = useState(false)
  const url = `/api/authors/${encodeURIComponent(slug)}/follow`

  if (!signedIn) {
    return (
      <Link href={`/signin?callbackUrl=${encodeURIComponent(`/authors/${encodeURIComponent(slug)}`)}`} className={primaryButtonClass}>
        Follow
      </Link>
    )
  }

  const toggle = () => {
    const next = !isFollowing
    setIsLoading(true)
    ;(next ? axios.put(url) : axios.delete(url))
      .then(() => setIsFollowing(next))
      // Safe to retry: the request sets the state rather than toggling it.
      .catch(() => notify.error(next ? `Couldn't follow ${name}. Try again.` : `Couldn't unfollow ${name}. Try again.`, { retry: toggle }))
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

export default FollowAuthorButton
