"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { Check, Link2 } from 'lucide-react'
import { BUDDY_READ_MAX_MEMBERS } from '@/lib/buddyReads'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'

interface InvitePanelProps {
  buddyReadId: string
  inviteCode: string
  memberCount: number
}

// The link is the main way in (it unfurls with the cover and everyone's colours); a username invite
// also lands in their notifications. Neither needs a follow.
const InvitePanel: FC<InvitePanelProps> = ({ buddyReadId, inviteCode, memberCount }) => {
  const [copied, setCopied] = useState(false)
  const [username, setUsername] = useState("")
  const [isSending, setIsSending] = useState(false)
  const full = memberCount >= BUDDY_READ_MAX_MEMBERS

  const copy = async () => {
    const link = `${window.location.origin}/circles/join/${inviteCode}`
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Read along with me on Bookmark", url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Share sheet dismissed, or clipboard blocked: nothing to do.
    }
  }

  const invite = () => {
    const name = username.trim()
    if (!name || isSending) return
    setIsSending(true)
    axios.post(`/api/buddy-reads/${buddyReadId}/invite`, { username: name }).then(() => {
      notify.success(`Invited ${name.replace(/^@/, "")}`)
      setUsername("")
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't send that invite."), { retry: invite })
    }).finally(() => setIsSending(false))
  }

  if (full) {
    return <p className="text-sm text-muted-foreground">This reading circle is full ({BUDDY_READ_MAX_MEMBERS} readers).</p>
  }

  return (
    <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
      <h2 id="invite-heading" className="text-sm font-semibold">Invite readers</h2>
      <button type="button" onClick={copy} className={`${secondaryButtonClass} justify-start w-full`}>
        {copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
        <span aria-live="polite">{copied ? "Link copied" : "Copy invite link"}</span>
      </button>
      <form onSubmit={(e) => { e.preventDefault(); invite() }} className="flex gap-2">
        <label htmlFor="invite-username" className="sr-only">Username</label>
        <input
          id="invite-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@username"
          autoComplete="off"
          disabled={isSending}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <button type="submit" disabled={isSending || !username.trim()} className={secondaryButtonClass}>Invite</button>
      </form>
    </section>
  )
}

export default InvitePanel
