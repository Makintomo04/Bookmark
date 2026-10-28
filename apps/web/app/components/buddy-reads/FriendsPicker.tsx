"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import useSWR from 'swr'
import axios from 'axios'
import { Check } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { notify, apiError } from '@/lib/notify'
import type { FriendPerson } from '@/lib/friends'
import { cn } from '@/lib/utils'
import InitialAvatar from '../profile/InitialAvatar'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import StaffSeal from '@/app/components/profile-head/StaffSeal'

interface FriendsPickerProps {
  buddyReadId: string
  // Usernames already reading along, shown as such rather than offered.
  memberUsernames: string[]
  // How many more the circle can take.
  room: number
}

// Your friends (readers you follow who follow you back, lib/friends.ts) with a tick each, above the
// username box: pick several and invite them in one go. Each invite goes through the same route as a
// typed username, so a friend whose settings don't allow it is refused in the same words.
const FriendsPicker: FC<FriendsPickerProps> = ({ buddyReadId, memberUsernames, room }) => {
  const { data } = useSWR<FriendPerson[]>('/api/friends', fetcher, swrOptions)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [isSending, setIsSending] = useState(false)
  const friends = (Array.isArray(data) ? data : []).filter((f): f is FriendPerson & { username: string } => !!f.username)
  if (friends.length === 0) return null

  const members = new Set(memberUsernames)
  const toggle = (username: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(username)) next.delete(username)
      else if (next.size < room) next.add(username)
      return next
    })
  }

  const invite = async () => {
    const names = Array.from(picked)
    if (names.length === 0 || isSending) return
    setIsSending(true)
    const invited: string[] = []
    const failed: string[] = []
    // One at a time: each answer can differ (not taking invites, already here, full).
    for (const name of names) {
      try {
        await axios.post(`/api/buddy-reads/${buddyReadId}/invite`, { username: name })
        invited.push(name)
      } catch (err) {
        failed.push(name)
        notify.error(`${name}: ${apiError(err, "couldn't send that invite.")}`)
      }
    }
    if (invited.length > 0) notify.success(invited.length === 1 ? `Invited ${invited[0]}` : `Invited ${invited.length} friends`)
    // The ones that failed stay ticked, so a retry is one click.
    setPicked(new Set(failed))
    setIsSending(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <p id="friends-picker-label" className="text-xs text-muted-foreground">Friends</p>
      <ul role="group" aria-labelledby="friends-picker-label" className="flex max-h-60 flex-col gap-1 overflow-y-auto">
        {friends.map((friend) => {
          const here = members.has(friend.username)
          const on = picked.has(friend.username)
          return (
            <li key={friend.username}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={here || isSending || (!on && picked.size >= room)}
                onClick={() => toggle(friend.username)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent",
                  here && "opacity-60",
                )}
              >
                <span className="relative size-8 shrink-0 overflow-hidden rounded-full">
                  {friend.image
                    ? <Image src={friend.image} alt="" fill sizes="32px" className="object-cover" />
                    : <InitialAvatar username={friend.username} favColour={friend.favColour} label="" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {friend.username}
                  {friend.staffBadge && <StaffSeal kind={friend.staffBadge} size={16} pressable={false} className="ml-1 align-[-3px]" />}
                </span>
                {here
                  ? <span className="text-xs text-muted-foreground">Already here</span>
                  : (
                    <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded border", on ? "border-foreground bg-foreground text-background" : "border-neutral-300 dark:border-neutral-700")}>
                      {on && <Check size={14} />}
                    </span>
                  )}
              </button>
            </li>
          )
        })}
      </ul>
      {picked.size > 0 && (
        <button type="button" onClick={invite} disabled={isSending} className={cn(secondaryButtonClass, "self-start")}>
          {isSending ? "Inviting…" : picked.size === 1 ? "Invite 1 friend" : `Invite ${picked.size} friends`}
        </button>
      )}
    </div>
  )
}

export default FriendsPicker
