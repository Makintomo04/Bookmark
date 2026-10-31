"use client"
import { FC, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'

// Someone just joined from this reader's profile (JoinToFollow's ?joined=1): welcome them, offer Follow
// right in the toast, put focus on the Follow button too, and tidy the address. Following is still their
// choice: nothing happens until they press one.
const WelcomeBack: FC<{ username: string; name: string }> = ({ username, name }) => {
  const router = useRouter()
  useEffect(() => {
    // The one on screen: the profile head renders a layout for each screen size.
    const followButton = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-follow-button]')).find((b) => b.offsetParent !== null)
    notify.success("Welcome to Bookmark", {
      description: `Follow ${name} to see what they read in your feed.`,
      // Presses the page's own Follow button, so its state and any follow request stay in one place.
      // Skipped if they've followed by then, as the endpoint toggles.
      action: { label: `Follow ${name}`, onClick: () => { const b = followButton(); if (b && b.getAttribute('aria-pressed') !== 'true') b.click() } },
    })
    followButton()?.focus()
    router.replace(`/u/${encodeURIComponent(username)}`, { scroll: false })
  // Once, on arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export default WelcomeBack
