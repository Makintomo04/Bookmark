"use client"
import { useState } from 'react'
import { SENTRY_DSN } from '@/lib/sentry'
import { Button } from '../ui/button'
import { cardClass } from './staffApi'

// Sends a test error from the server and from this browser, to check that both reach Sentry after a deploy
// (BOO-54). Each shows up as its own issue, tagged with this build's release and environment.
const StaffMonitoring = () => {
  const [serverSent, setServerSent] = useState(false)
  const [browserError, setBrowserError] = useState(false)

  // Thrown while rendering, so the page's error boundary catches it and reports it like any real crash.
  if (browserError) throw new Error(`Bookmark test error from the browser, ${new Date().toISOString()}`)

  const throwOnServer = async () => {
    await fetch('/api/staff/monitoring-test', { method: 'POST' }).catch(() => null)
    setServerSent(true)
  }

  return (
    <div className={cardClass}>
      <h2 className="font-semibold">Error monitoring</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {SENTRY_DSN
          ? 'Sentry is on for this build. Each button sends one test error; look for it in Sentry in a minute or so.'
          : 'Sentry is off for this build: NEXT_PUBLIC_SENTRY_DSN isn’t set, so nothing will be sent.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="outline" onClick={throwOnServer}>Throw on the server</Button>
        <Button variant="outline" onClick={() => setBrowserError(true)}>Throw in the browser</Button>
      </div>
      {serverSent && <p className="mt-3 text-sm text-muted-foreground">Sent. The server answered with a 500, as it should.</p>}
    </div>
  )
}

export default StaffMonitoring
