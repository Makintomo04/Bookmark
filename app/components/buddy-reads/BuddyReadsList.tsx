"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { toast } from 'react-toastify'
import { Lock, Plus } from 'lucide-react'
import useBuddyReads, { type BuddyReadSummary } from '@/app/hooks/useBuddyReads'
import { formatPercent } from '@/lib/buddyReads'
import BookCover from '../cards/BookCover'
import FetchErrorState from '../FetchErrorState'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import MemberAvatar from './MemberAvatar'

const cover = (b: { title: string, author: string, coverImage: string | null, cardColour: string | null }) =>
  ({ title: b.title, author: b.author, coverImage: b.coverImage ?? "", cardColour: b.cardColour })

// Who's where, at a glance: everyone on one track, each reader's avatar at their percent, and the
// gap between you and the front of the pack in words.
const BuddyReadCard: FC<{ buddyRead: BuddyReadSummary }> = ({ buddyRead }) => {
  const sorted = [...buddyRead.members].sort((a, b) => a.progress - b.progress)
  const furthest = sorted[sorted.length - 1]
  const finished = buddyRead.members.filter((m) => m.progress >= 100).length
  const ahead = buddyRead.members.filter((m) => m.progress > buddyRead.myProgress).length
  const status = buddyRead.members.length === 1 ? "Waiting for friends to join"
    : finished === buddyRead.members.length ? "Everyone's finished"
    : ahead === 0 ? "You're furthest along"
    : `${ahead} ${ahead === 1 ? "reader is" : "readers are"} ahead of you`
  return (
    <Link
      href={`/buddy-reads/${buddyRead.id}`}
      className="flex gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BookCover book={cover(buddyRead)} variant="thumb" sizes="64px" className="w-16 shrink-0 self-start shadow-sm" />
      <div className="min-w-0 flex-1 flex flex-col gap-3">
        <div>
          <p className="font-semibold leading-snug line-clamp-2">{buddyRead.title}</p>
          <p className="text-sm text-muted-foreground truncate">{buddyRead.author}{buddyRead.isHost ? " · You're hosting" : ""}</p>
        </div>
        <div className="relative h-8 mx-3" aria-label={`You're at ${formatPercent(buddyRead.myProgress)}; ${status}`}>
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          {furthest && (
            <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-neutral-300 dark:bg-neutral-700" style={{ width: `${furthest.progress}%` }} />
          )}
          {sorted.map((m) => (
            <span
              key={m.userId}
              title={`${m.username}: ${formatPercent(m.progress)}`}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${m.progress}%` }}
            >
              <MemberAvatar username={m.username} image={m.image} favColour={m.favColour} size={26} ringed className="rounded-full" />
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{status}</span>
          <span className="tabular-nums font-medium text-foreground">You&apos;re at {formatPercent(buddyRead.myProgress)}</span>
        </div>
      </div>
    </Link>
  )
}

const BuddyReadsList: FC = () => {
  const router = useRouter()
  const { buddyReads, hosting, invites, isError, isLoading, mutate } = useBuddyReads()
  const [busyInvite, setBusyInvite] = useState<string | null>(null)

  const accept = (inviteId: string, code: string) => {
    setBusyInvite(inviteId)
    axios.post("/api/buddy-reads/join", { code }).then(({ data }) => {
      if (data.addedToShelf) toast.success("Added to your Currently reading shelf", { position: "bottom-center" })
      router.push(`/buddy-reads/${data.buddyReadId}`)
    }).catch((err) => {
      toast.error(err?.response?.data?.error || "Couldn't join.", { position: "bottom-center" })
      setBusyInvite(null)
    })
  }

  const decline = (inviteId: string, buddyReadId: string) => {
    setBusyInvite(inviteId)
    axios.delete(`/api/buddy-reads/${buddyReadId}/invite`).then(() => mutate()).finally(() => setBusyInvite(null))
  }

  const active = (buddyReads ?? []).filter((b) => b.status === "ACTIVE")
  const finished = (buddyReads ?? []).filter((b) => b.status === "FINISHED")

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="text-3xl sm:text-4xl font-bold">Circles</h1>
          <p className="mt-2 text-muted-foreground">
            Read a book with friends. See where everyone is, and talk about it as you go. Comments stay locked until you reach them.
          </p>
        </div>
        <Link href="/buddy-reads/new" className={`${primaryButtonClass} shrink-0`}><Plus size={16} aria-hidden />Start a circle</Link>
      </header>

      {hosting && !hosting.allowed && (
        <p className="flex items-start gap-2 rounded-xl bg-neutral-100 dark:bg-neutral-900 px-4 py-3 text-sm">
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
          <span>{hosting.message}</span>
        </p>
      )}

      {isError && !buddyReads && <FetchErrorState error={isError} what="your circles" onRetry={() => mutate()} />}

      {invites.length > 0 && (
        <section aria-labelledby="invites-heading" className="flex flex-col gap-3">
          <h2 id="invites-heading" className="text-lg font-semibold">Invites</h2>
          <ul className="flex flex-col gap-3">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
                <BookCover book={cover(invite.buddyRead)} variant="thumb" sizes="48px" className="w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug line-clamp-2">{invite.buddyRead.title}</p>
                  <p className="text-sm text-muted-foreground">{invite.inviter.username} invited you</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => decline(invite.id, invite.buddyRead.id)} disabled={busyInvite === invite.id} className={secondaryButtonClass}>Not now</button>
                  <button type="button" onClick={() => accept(invite.id, invite.buddyRead.inviteCode)} disabled={busyInvite === invite.id} className={primaryButtonClass}>Join</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isLoading && !buddyReads ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-28 rounded-xl bg-neutral-100 dark:bg-neutral-900 animate-pulse" />)}
        </div>
      ) : buddyReads && active.length === 0 && finished.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center flex flex-col items-center gap-3">
          <p className="font-medium">No circles yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Pick a book from your shelf, share the link, and read it together. Up to 15 readers, any edition.
          </p>
          <Link href="/buddy-reads/new" className={primaryButtonClass}>Start one</Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section aria-labelledby="active-heading" className="flex flex-col gap-2">
              <h2 id="active-heading" className="text-lg font-semibold">Reading now</h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {active.map((b) => <li key={b.id}><BuddyReadCard buddyRead={b} /></li>)}
              </ul>
            </section>
          )}
          {finished.length > 0 && (
            <section aria-labelledby="finished-heading" className="flex flex-col gap-2">
              <h2 id="finished-heading" className="text-lg font-semibold">Finished</h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {finished.map((b) => <li key={b.id}><BuddyReadCard buddyRead={b} /></li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default BuddyReadsList
