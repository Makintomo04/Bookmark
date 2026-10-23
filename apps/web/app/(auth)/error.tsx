'use client' // Error components must be Client Components

import ErrorState from '../components/ErrorState'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorState error={error} reset={reset} fullScreen />
}
