'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // This is the last-resort boundary - it only fires when something in
    // the root layout itself throws. Kept deliberately simple/dependency-free
    // since app-level components may be part of what's broken.
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', textAlign: 'center', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700 }}>Something went wrong.</h2>
          <p style={{ color: '#9ca3af', maxWidth: '28rem' }}>
            Sorry about that - please try again, and if it keeps happening let us know.
          </p>
          <button
            onClick={() => reset()}
            style={{ background: '#D92D2D', color: '#fff', padding: '0.5rem 1.5rem', borderRadius: '0.375rem', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
