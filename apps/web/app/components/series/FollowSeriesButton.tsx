"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { mutate } from 'swr'
import { cn } from '@/lib/utils'
import { notify } from '@/lib/notify'

interface FollowSeriesButtonProps {
  name: string
  author: string
  initialFollowing: boolean
  signedIn: boolean
  // Where sign-in comes back to.
  returnTo: string
  className?: string
}

export const SERIES_TRACKER_KEY = '/api/series/tracker'

const pillClass = "inline-flex items-center h-7 px-3 rounded-full border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
const offClass = "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
const onClass = "border-transparent bg-foreground text-background hover:opacity-90"

// Follow series / Following on a book or author page. Free for every reader. Signed out, it goes to
// sign-in and back.
const FollowSeriesButton: FC<FollowSeriesButtonProps> = ({ name, author, initialFollowing, signedIn, returnTo, className }) => {
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [isLoading, setIsLoading] = useState(false)

  if (!signedIn) {
    return (
      <Link href={`/signin?callbackUrl=${encodeURIComponent(returnTo)}`} className={cn(pillClass, offClass, className)}>
        Follow series
      </Link>
    )
  }

  const toggle = () => {
    const next = !isFollowing
    const body = { name, author }
    setIsLoading(true)
    ;(next ? axios.put('/api/series/follow', body) : axios.delete('/api/series/follow', { data: body }))
      .then(() => {
        setIsFollowing(next)
        void mutate(SERIES_TRACKER_KEY)
      })
      // Safe to retry: the request sets the state rather than toggling it.
      .catch(() => notify.error(next ? `Couldn't follow ${name}. Try again.` : `Couldn't unfollow ${name}. Try again.`, { retry: toggle }))
      .finally(() => setIsLoading(false))
  }

  return (
    <button
      type="button"
      disabled={isLoading}
      aria-pressed={isFollowing}
      aria-label={isFollowing ? `Following ${name}` : `Follow ${name}`}
      onClick={toggle}
      className={cn(pillClass, isFollowing ? onClass : offClass, className)}
    >
      {isFollowing ? "Following series" : "Follow series"}
    </button>
  )
}

export default FollowSeriesButton
