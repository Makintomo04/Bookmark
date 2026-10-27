"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { Check, Plus } from 'lucide-react'
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
  // pill: a button of its own (author pages); text: a quiet link-like toggle beside a heading (book pages).
  variant?: 'pill' | 'text'
  className?: string
}

export const SERIES_TRACKER_KEY = '/api/series/tracker'

const pillClass = "inline-flex items-center h-7 px-3 rounded-full border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
const offClass = "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
const onClass = "border-transparent bg-foreground text-background hover:opacity-90"
const textClass = "inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"

// Follow series / Following on a book or author page. Free for every reader. Signed out, it goes to
// sign-in and back.
const FollowSeriesButton: FC<FollowSeriesButtonProps> = ({ name, author, initialFollowing, signedIn, returnTo, variant = 'pill', className }) => {
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [isLoading, setIsLoading] = useState(false)
  const styleFor = (following: boolean) => (variant === 'text' ? cn(textClass, following && "text-foreground") : cn(pillClass, following ? onClass : offClass))
  const icon = (following: boolean) => variant === 'text' && (following ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />)

  if (!signedIn) {
    return (
      <Link href={`/signin?callbackUrl=${encodeURIComponent(returnTo)}`} className={cn(styleFor(false), className)}>
        {icon(false)}Follow series
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
      className={cn(styleFor(isFollowing), className)}
    >
      {icon(isFollowing)}{isFollowing ? "Following series" : "Follow series"}
    </button>
  )
}

export default FollowSeriesButton
