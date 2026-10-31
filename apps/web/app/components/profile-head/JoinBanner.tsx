import { FC } from 'react'
import Link from 'next/link'
import { primaryButtonClass, secondaryButtonClass } from './ProfileHeader'

// What a signed-out visitor sees above a reader's profile (BOO-53). The profile's own address is the
// invite: a reader shares /u/<them> from their bio or the app, and a friend who opens it lands here.
// Joining and following stay separate steps (the persona panel's round 3): sign-up brings them back to
// this profile, where they choose to follow. It promises nothing it can't keep: no counts, no circles
// (those are invite-only), and the privacy line says what's true (books are shared unless made private).
const JoinBanner: FC<{ username: string; name: string }> = ({ username, name }) => {
  const back = encodeURIComponent(`/u/${encodeURIComponent(username)}`)
  return (
    <section aria-labelledby="join-banner-title" className="mb-6 flex flex-col gap-4 rounded-2xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-neutral-800">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="join-banner-title" className="font-display text-xl font-semibold text-balance">Read with {name} on Bookmark</h2>
        <p className="text-sm text-muted-foreground">Track your books, see what {name} is reading, and follow them. Free, with no card.</p>
        <p className="text-xs text-muted-foreground">You choose who sees your shelf, and any book can be private.</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href={`/register?callbackUrl=${back}`} className={primaryButtonClass}>Join Bookmark</Link>
        <Link href={`/signin?callbackUrl=${back}`} className={secondaryButtonClass}>Sign in</Link>
      </div>
    </section>
  )
}

export default JoinBanner
