"use client"
import { FC, useState } from 'react'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import Image from 'next/image'
import InitialAvatar from '@/app/components/profile/InitialAvatar'
import Link from 'next/link'
import axios from 'axios'
import useSWRInfinite from 'swr/infinite'
import { useSWRConfig } from 'swr'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import type { FollowListKind, FollowListUser } from '@/lib/follows'
import Modal from './Modal'
import Loader from '../Loader'
import useUser from '@/app/hooks/useUser'
import usePublicProfile from '@/app/hooks/usePublicProfile'
import useFollowListModal from '@/app/hooks/useFollowListModal'

interface FollowPage {
  users: FollowListUser[]
  nextCursor: string | null
}

const KINDS: FollowListKind[] = ["followers", "following"]

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error("Couldn't load this list.")
  return r.json()
})

const FollowList: FC<{ username: string, kind: FollowListKind, onNavigate: () => void }> = ({ username, kind, onNavigate }) => {
  const { user } = useUser()
  const booksReadFor = useBooksReadFor()
  const { mutate } = useSWRConfig()
  const signedIn = !!user?.id
  // Kept locally so a row doesn't jump around or refetch while you're working down the list.
  const [followState, setFollowState] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const base = `/api/users/${encodeURIComponent(username)}/${kind}`
  const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite<FollowPage>(
    (index, previous) => {
      if (previous && !previous.nextCursor) return null
      return index === 0 ? base : `${base}?cursor=${previous!.nextCursor}`
    },
    fetcher,
    { revalidateFirstPage: false }
  )

  const handleFollow = (person: string, current: boolean) => {
    setBusy(person)
    axios.post(`/api/users/${encodeURIComponent(person)}/follow`)
      .then((res) => {
        setFollowState((state) => ({ ...state, [person]: res.data.isFollowing }))
        // Follower/following counts on any open profile (including your own) are now stale.
        mutate((key) => typeof key === "string" && key.startsWith("/api/users/") && !key.includes("/search"))
      })
      .catch(() => notify.error(current ? "Couldn't unfollow. Try again." : "Couldn't follow. Try again.", { retry: () => handleFollow(person, current) }))
      .finally(() => setBusy(null))
  }

  if (isLoading) return <Loader notScreen />
  if (error) return <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load this list. Try again in a moment.</p>

  const people = data?.flatMap((page) => page.users) ?? []
  const hasMore = !!data?.[data.length - 1]?.nextCursor
  const isLoadingMore = isValidating && size > (data?.length ?? 0)

  if (people.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {kind === "followers" ? "No followers yet." : "Not following anyone yet."}
      </p>
    )
  }

  return (
    <>
      <ul className="flex flex-col">
        {people.map((person) => {
          const following = followState[person.username] ?? person.isFollowing
          return (
            <li key={person.username} className="flex items-center justify-between gap-3 py-2.5">
              <Link href={`/u/${person.username}`} onClick={onNavigate} className="flex items-center gap-3 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="relative size-11 shrink-0 overflow-hidden rounded-[14px]" style={{ background: person.favColour || "#D92D2D", ...tierRingStyle(booksReadFor(person.username, booksReadOf(person))) }}>
                  {person.image
                    ? <Image src={person.image} alt="" fill sizes="44px" className="object-cover" />
                    : <InitialAvatar username={person.username} favColour={person.favColour} />}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{person.username}{person.isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}</p>
                  {person.bio && <p className="truncate text-xs text-muted-foreground">{person.bio}</p>}
                </div>
              </Link>
              {signedIn && !person.isSelf && (
                <button
                  type="button"
                  disabled={busy === person.username}
                  aria-pressed={following}
                  onClick={() => handleFollow(person.username, following)}
                  className={cn(
                    "shrink-0 h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    following ? "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900" : "bg-foreground text-background hover:opacity-90"
                  )}
                >
                  {following ? "Following" : "Follow"}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setSize(size + 1)}
          disabled={isLoadingMore}
          className="mt-3 w-full h-9 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 transition disabled:opacity-60"
        >
          {isLoadingMore ? "Loading…" : "Show more"}
        </button>
      )}
    </>
  )
}

const FollowListModal: FC = () => {
  const { isOpen, username, kind, setKind, onClose } = useFollowListModal()
  const { profile } = usePublicProfile(isOpen ? username : "")

  const counts: Record<FollowListKind, number | undefined> = {
    followers: profile?.followerCount,
    following: profile?.followingCount,
  }

  const bodyContent = (
    <div className="w-full self-start px-6 pb-6">
      <div role="tablist" aria-label="Connections" className="grid grid-cols-2 border-b border-neutral-200 dark:border-neutral-800">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "-mb-px h-10 border-b-2 text-sm font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              kind === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {counts[k] !== undefined && <span className="tabular-nums">{counts[k]} </span>}
            {k === "followers" && counts[k] === 1 ? "follower" : k}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-2">
        {/* Keyed so switching tab or profile starts from a clean list. */}
        <FollowList key={`${username}:${kind}`} username={username} kind={kind} onNavigate={onClose} />
      </div>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={username}
      body={bodyContent}
      compact
    />
  )
}

export default FollowListModal
