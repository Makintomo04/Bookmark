'use client'
import { FC, useEffect, useState } from 'react'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'

// Muting is per circle and only for you: no comment notifications from it, in the bell or as a push.
// Shown straight away, then put back if the server says no.
const MuteCircleButton: FC<{ buddyReadId: string, viewerId: string, muted: boolean, onChange: () => void }> = ({ buddyReadId, viewerId, muted, onChange }) => {
  const [shown, setShown] = useState(muted)
  useEffect(() => setShown(muted), [muted])

  const toggle = () => {
    const next = !shown
    setShown(next)
    axios.patch(`/api/buddy-reads/${buddyReadId}/members/${viewerId}`, { muted: next }).then(() => onChange())
      .catch((err) => {
        setShown(!next)
        notify.error(apiError(err, next ? "Couldn't mute the reading circle." : "Couldn't unmute the reading circle."))
      })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={toggle} aria-pressed={shown} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {shown ? "Unmute this circle" : "Mute this circle"}
      </button>
      <p className="text-xs text-muted-foreground">
        {shown ? "You won't hear about new comments here." : "Stop hearing about new comments here."} Invites and hosting changes still reach you.
      </p>
    </div>
  )
}

export default MuteCircleButton
