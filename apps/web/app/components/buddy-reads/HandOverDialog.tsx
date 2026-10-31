"use client"
import { FC, useEffect, useState } from 'react'
import { readerName } from '@/lib/profile'
import ReaderName from '@/app/components/profile/ReaderName'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import type { BuddyReadView } from '@/lib/buddyReadsServer'
import Modal from '../modals/Modal'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import MemberAvatar from './MemberAvatar'
import StaffSeal from '@/app/components/profile-head/StaffSeal'

type Member = Pick<BuddyReadView["members"][number], "userId" | "username" | "displayName" | "image" | "favColour" | "staffBadge">

interface HandOverDialogProps {
  isOpen: boolean
  onClose: () => void
  buddyReadId: string
  viewerId: string
  // Everyone else in the circle, longest-standing first.
  members: Member[]
  onLeft: () => void
  // Handing over a club instead (buddyReadId is then the club's id).
  club?: boolean
}

// A host leaves by choosing who hosts after them. The longest-standing member is picked to start with.
const HandOverDialog: FC<HandOverDialogProps> = ({ isOpen, onClose, buddyReadId, viewerId, members, onLeft, club }) => {
  const noun = club ? "club" : "reading circle"
  const [chosen, setChosen] = useState<string | null>(members[0]?.userId ?? null)
  const [busy, setBusy] = useState(false)

  // Members come and go between polls: keep the choice if they're still here, else the longest-standing.
  useEffect(() => {
    if (isOpen) setChosen((c) => (c && members.some((m) => m.userId === c) ? c : members[0]?.userId ?? null))
  }, [isOpen, members])

  const leave = () => {
    if (!chosen) return
    setBusy(true)
    axios.delete(`/api/${club ? "clubs" : "buddy-reads"}/${buddyReadId}/members/${viewerId}?newHost=${chosen}`)
      .then(() => {
        const picked = members.find((m) => m.userId === chosen)
        const name = picked ? readerName(picked) : null
        notify.success(`You've left. ${name ?? "They"} hosts the ${noun} now.`)
        onLeft()
      })
      .catch((err) => notify.error(apiError(err, `Couldn't hand the ${noun} over.`)))
      .finally(() => setBusy(false))
  }

  const body = (
    <div className="flex w-full flex-col gap-4 px-6 pt-4">
      <p className="text-sm text-muted-foreground">
        {club
          ? "The new host can choose co-hosts, start the next book, invite and remove members, and archive the club. You'll leave the books it's reading now; the ones you've finished stay in your history."
          : "The new host can invite and remove readers, change the schedule, and finish or archive the circle. Your comments stay where they are."}
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Who should host next?</legend>
        {members.map((m, i) => (
          <label key={m.userId} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 has-[:checked]:border-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <input type="radio" name="new-host" value={m.userId} aria-label={readerName(m) || "Reader"} checked={chosen === m.userId} onChange={() => setChosen(m.userId)} className="sr-only" />
            <MemberAvatar username={m.username} image={m.image} favColour={m.favColour} size={32} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium"><ReaderName reader={m} badge={m.staffBadge && <StaffSeal kind={m.staffBadge} size={16} pressable={false} className="ml-1 align-[-3px]" />} /></span>
            {i === 0 && <span className="shrink-0 text-xs text-muted-foreground">Here longest</span>}
          </label>
        ))}
      </fieldset>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Hand over and leave"
      size="sm"
      compact
      disabled={busy}
      body={body}
      footer={
        <div className="flex flex-wrap justify-end gap-2 p-6 pt-4">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButtonClass}>Stay</button>
          <button type="button" onClick={leave} disabled={busy || !chosen} className={primaryButtonClass}>
            {busy ? "Handing over…" : "Hand over and leave"}
          </button>
        </div>
      }
    />
  )
}

export default HandOverDialog
