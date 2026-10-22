"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { followButtonLabel } from '@/lib/followRules'
import { Flag, Pencil, Plus } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/dropdown-menu'
import useUser from '@/app/hooks/useUser'
import { REPORT_REASONS } from '@/lib/listRules'
import useListEditorModal, { EditableList, emptyList } from '@/app/hooks/useListEditorModal'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'

// Picks are team-only; readers start their own lists from their profile or a book's "Add to list".
export const NewPickButton: FC = () => {
  const { user } = useUser()
  const { onOpen } = useListEditorModal()
  if (!user?.isStaff) return null
  return (
    <button type="button" onClick={() => onOpen(emptyList(true))} className={secondaryButtonClass}>
      <Plus size={16} aria-hidden />New Pick
    </button>
  )
}

export const EditListButton: FC<{ list: EditableList }> = ({ list }) => {
  const { onOpen } = useListEditorModal()
  return (
    <button type="button" onClick={() => onOpen(list)} className={secondaryButtonClass}>
      <Pencil size={14} aria-hidden />Edit list
    </button>
  )
}

export const FollowButton: FC<{ username: string, initialFollowing: boolean }> = ({ username, initialFollowing }) => {
  const { user } = useUser()
  const [following, setFollowing] = useState(initialFollowing)
  const [requested, setRequested] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  if (!user?.id) {
    return <Link href="/register" className={primaryButtonClass}>Follow</Link>
  }

  const toggle = () => {
    setIsBusy(true)
    axios.post(`/api/users/${encodeURIComponent(username)}/follow`)
      .then((res) => {
        setFollowing(!!res.data.isFollowing)
        setRequested(!!res.data.requested)
        if (res.data.requested) notify.success(`Asked to follow ${username}. You'll be following once they accept.`)
      })
      // No retry action: the endpoint toggles, so retrying a request that did land would undo it.
      .catch(() => notify.error(following ? "Couldn't unfollow. Try again." : "Couldn't follow. Try again."))
      .finally(() => setIsBusy(false))
  }

  return (
    <button type="button" onClick={toggle} disabled={isBusy} aria-pressed={following || requested} className={following || requested ? secondaryButtonClass : primaryButtonClass}>
      {followButtonLabel({ isFollowing: following, requested, needsApproval: false })}
    </button>
  )
}

export const ReportListButton: FC<{ listId: string, initialReported: boolean }> = ({ listId, initialReported }) => {
  const { user } = useUser()
  const [reported, setReported] = useState(initialReported)
  const [isBusy, setIsBusy] = useState(false)
  if (!user?.id) return null

  if (reported) {
    return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Flag size={12} aria-hidden />Reported. Thanks for letting us know.</span>
  }

  const report = (reason: string) => {
    setIsBusy(true)
    axios.post(`/api/lists/${listId}/report`, { reason })
      .then(() => {
        setReported(true)
      })
      .catch(() => notify.error("Couldn't send your report. Try again.", { retry: () => report(reason) }))
      .finally(() => setIsBusy(false))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Flag size={12} aria-hidden />Report list
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">What&apos;s wrong with it?</DropdownMenuLabel>
        {REPORT_REASONS.map((reason) => (
          <DropdownMenuItem key={reason} onSelect={() => report(reason)} className="cursor-pointer">{reason}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
