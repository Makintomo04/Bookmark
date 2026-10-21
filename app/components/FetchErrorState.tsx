"use client"
import { FC } from 'react'
import Link from 'next/link'
import { isUnauthorized } from '@/lib/fetcher'
import { primaryButtonClass, secondaryButtonClass } from './profile-head/ProfileHeader'

interface FetchErrorStateProps {
  error: unknown
  // What failed to load, e.g. "your feed".
  what: string
  onRetry?: () => void
}

// Shown when an SWR hook errors: a sign-in prompt for a 401, otherwise an error with a retry.
const FetchErrorState: FC<FetchErrorStateProps> = ({ error, what, onRetry }) => {
  if (isUnauthorized(error)) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">Sign in to see {what}.</p>
        <Link href="/signin" className={primaryButtonClass}>Sign in</Link>
      </div>
    )
  }

  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-muted-foreground">Couldn&apos;t load {what}. Check your connection and try again.</p>
      {onRetry && <button type="button" onClick={onRetry} className={secondaryButtonClass}>Try again</button>}
    </div>
  )
}

export default FetchErrorState
