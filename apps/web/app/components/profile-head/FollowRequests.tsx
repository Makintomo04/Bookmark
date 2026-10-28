"use client"
import { FC, useState } from 'react'
import { readerName } from '@/lib/profile'
import ReaderName from '@/app/components/profile/ReaderName'
import Image from 'next/image'
import Link from 'next/link'
import useSWR, { mutate as revalidate } from 'swr'
import axios from 'axios'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { notify, apiError } from '@/lib/notify'
import type { PendingFollowRequest } from '@/lib/followRequests'
import InitialAvatar from '../profile/InitialAvatar'
import { primaryButtonClass, secondaryButtonClass } from './ProfileHeader'
import StaffSeal from '@/app/components/profile-head/StaffSeal'

// The owner's pending follow requests (profiles that aren't public approve each follower). Renders
// nothing when there are none, so it can sit at the top of the profile and in Settings.
const FollowRequests: FC<{ className?: string }> = ({ className }) => {
  const { data, mutate } = useSWR<PendingFollowRequest[]>('/api/follow-requests', fetcher, swrOptions)
  const [busy, setBusy] = useState<string | null>(null)
  const requests = Array.isArray(data) ? data : []
  if (requests.length === 0) return null

  const respond = (request: PendingFollowRequest, action: 'accept' | 'decline') => {
    setBusy(request.id)
    axios.post(`/api/follow-requests/${request.id}`, { action })
      .then(() => {
        mutate(requests.filter((r) => r.id !== request.id), { revalidate: true })
        if (action === 'accept') notify.success(`${readerName(request.requester) || 'They'} can now see your profile.`)
      })
      .catch((err) => notify.error(apiError(err, "Couldn't answer that request. Try again.")))
      .finally(() => {
        setBusy(null)
        // Its notification in the bell is gone too.
        revalidate((key) => typeof key === 'string' && key.startsWith('/api/notifications'))
      })
  }

  return (
    <section aria-labelledby="follow-requests-title" className={className}>
      <div className="rounded-xl border border-border p-4 sm:p-5">
        <h2 id="follow-requests-title" className="font-semibold">
          Follow requests <span className="text-muted-foreground font-normal">{requests.length}</span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Your profile isn&apos;t public, so you choose who follows you.</p>
        <ul className="mt-4 flex flex-col gap-3">
          {requests.map((request) => {
            const name = readerName(request.requester) || 'A reader'
            return (
              <li key={request.id} className="flex flex-wrap items-center gap-3">
                <Link href={`/u/${encodeURIComponent(request.requester.username ?? '')}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-full">
                    {request.requester.image
                      ? <Image src={request.requester.image} alt="" fill sizes="40px" className="object-cover" />
                      : <InitialAvatar username={request.requester.username} favColour={request.requester.favColour} />}
                  </span>
                  <span className="truncate font-medium"><ReaderName reader={request.requester} badge={request.requester.staffBadge && <StaffSeal kind={request.requester.staffBadge} size={18} pressable={false} className="ml-1 align-[-4px]" />} /></span>
                </Link>
                <div className="flex gap-2">
                  <button type="button" disabled={busy === request.id} onClick={() => respond(request, 'accept')} className={primaryButtonClass} aria-label={`Accept ${name}'s request`}>
                    Accept
                  </button>
                  <button type="button" disabled={busy === request.id} onClick={() => respond(request, 'decline')} className={secondaryButtonClass} aria-label={`Decline ${name}'s request`}>
                    Decline
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export default FollowRequests
