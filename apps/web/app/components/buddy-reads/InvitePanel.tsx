"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { Check, Link2 } from 'lucide-react'
import { BUDDY_READ_MAX_MEMBERS } from '@/lib/buddyReads'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import FriendsPicker from './FriendsPicker'
import { ClearableInput } from '@/app/components/ui/clearable-input'

interface InvitePanelProps {
  buddyReadId: string
  inviteCode: string
  memberCount: number
  // Who's already reading along, so the friends picker can say so.
  memberUsernames?: string[]
  // The host can swap the link for a new one, e.g. after it was shared too widely.
  isHost?: boolean
  onLinkReset?: () => void
  // A club's circle shares the club's link instead: new readers join the club, and every book after.
  clubInviteCode?: string | null
}

// The link is the main way in (it unfurls with the cover and everyone's colours); a friend can be ticked
// from the list, and anyone else invited by username: both land in their notifications. Neither needs a follow.
const InvitePanel: FC<InvitePanelProps> = ({ buddyReadId, inviteCode, memberCount, memberUsernames = [], isHost, onLinkReset, clubInviteCode }) => {
  const [copied, setCopied] = useState(false)
  const [username, setUsername] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const full = memberCount >= BUDDY_READ_MAX_MEMBERS

  const copy = async () => {
    const link = clubInviteCode ? `${window.location.origin}/clubs/join/${clubInviteCode}` : `${window.location.origin}/circles/join/${inviteCode}`
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

  const resetLink = () => {
    if (!window.confirm("Reset the invite link? The old link stops working straight away. Everyone already here stays.")) return
    setIsResetting(true)
    axios.post(`/api/buddy-reads/${buddyReadId}/invite-link`).then(() => {
      notify.success("Invite link reset", { description: "Copy the new one to share it." })
      onLinkReset?.()
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't reset the invite link."))
    }).finally(() => setIsResetting(false))
  }

  if (full) {
    return <p className="text-sm text-muted-foreground">This reading circle is full ({BUDDY_READ_MAX_MEMBERS} readers).</p>
  }

  return (
    <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
      <h2 id="invite-heading" className="text-sm font-semibold">Invite readers</h2>
      <button type="button" onClick={copy} className={`${secondaryButtonClass} justify-start w-full`}>
        {copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
        <span aria-live="polite">{copied ? "Link copied" : clubInviteCode ? "Copy the club's invite link" : "Copy invite link"}</span>
      </button>
      {clubInviteCode && <p className="text-xs text-muted-foreground">Whoever joins with it joins the club, so they&apos;re in for this book and the next.</p>}
      {isHost && !clubInviteCode && (
        <button type="button" onClick={resetLink} disabled={isResetting} className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60">
          {isResetting ? "Resetting…" : "Reset link"}
        </button>
      )}
      <FriendsPicker buddyReadId={buddyReadId} memberUsernames={memberUsernames} room={BUDDY_READ_MAX_MEMBERS - memberCount} />
      <form onSubmit={(e) => { e.preventDefault(); invite() }} className="flex gap-2">
        <label htmlFor="invite-username" className="sr-only">Username</label>
        <ClearableInput
          id="invite-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@username"
          autoComplete="off"
          disabled={isSending}
          wrapperClassName="flex-1"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <button type="submit" disabled={isSending || !username.trim()} className={secondaryButtonClass}>Invite</button>
      </form>
    </section>
  )
}

export default InvitePanel
