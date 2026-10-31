"use client"
import { FC, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'

// Someone just joined from this reader's profile (JoinToFollow's ?joined=1): welcome them, put focus on
// Follow so it's one press away, and tidy the address. Following is still their choice.
const WelcomeBack: FC<{ username: string; name: string }> = ({ username, name }) => {
  const router = useRouter()
  useEffect(() => {
    notify.success("Welcome to Bookmark", { description: `Follow ${name} to see what they read in your feed.` })
    document.querySelector<HTMLButtonElement>('[data-follow-button]')?.focus()
    router.replace(`/u/${encodeURIComponent(username)}`, { scroll: false })
  // Once, on arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export default WelcomeBack
