"use client"
import { FC, useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import Container from '../Container'

const DISMISSED_KEY = 'bookmark.joinBanner.dismissed'

// What a signed-out visitor sees above a reader's profile (BOO-53): a site-wide-style sign-up bar,
// edge to edge, filling the space between the header and the profile (the page's top padding), with its
// content on the page's inner line. The profile's own address is the invite: a reader shares /u/<them>
// from their bio or the app, and a friend who opens it sees this. Joining and following stay separate
// steps (the persona panel's round 3): sign-up brings them back to this profile, where they choose to
// follow. No counts and no circles (those are invite-only). Closing it hides it in this browser for good.
const JoinBanner: FC<{ username: string; name: string }> = ({ username, name }) => {
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISSED_KEY) === '1') } catch {}
  }, [])
  if (dismissed) return null

  const back = encodeURIComponent(`/u/${encodeURIComponent(username)}`)
  const close = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch {}
  }

  return (
    // -mt-4 takes the page's top padding, so the bar fills the whole band from the header to the profile.
    <aside aria-label="Join Bookmark" className="-mt-4 border-y border-neutral-200 bg-neutral-50 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <Container className="flex items-center gap-3 py-3">
        <p className="min-w-0 flex-1 text-muted-foreground">
          <span className="font-medium text-foreground">Read with {name} on Bookmark.</span>{' '}
          <span className="max-sm:hidden">Track your books and follow friends. It&apos;s free.</span>
        </p>
        <Link href={`/signin?callbackUrl=${back}`} className="shrink-0 rounded-md px-2 py-1.5 font-medium text-foreground hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:hidden">
          Sign in
        </Link>
        <Link href={`/register?callbackUrl=${back}`} className="inline-flex h-8 shrink-0 items-center rounded-md bg-foreground px-3 font-medium text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          Join
        </Link>
        <button type="button" onClick={close} aria-label="Close" className="-mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-neutral-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-neutral-800">
          <X size={16} aria-hidden />
        </button>
      </Container>
    </aside>
  )
}

export default JoinBanner
