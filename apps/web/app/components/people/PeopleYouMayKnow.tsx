"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import axios from 'axios'
import useSWR from 'swr'
import { Share2, X } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { notify } from '@/lib/notify'
import { copyText } from '@/lib/copyText'
import { cn } from '@/lib/utils'
import { followButtonLabel } from '@/lib/followRules'
import useUser from '@/app/hooks/useUser'
import ReaderName from '@/app/components/profile/ReaderName'
import InitialAvatar from '@/app/components/profile/InitialAvatar'
import StaffSeal from '@/app/components/profile-head/StaffSeal'
import { feedShowsSuggestions, type PersonSuggestion } from '@bookmark/shared/peopleSuggest'

type Payload = { people: PersonSuggestion[]; followingCount: number }

interface Props {
  // "find": the Find people list on Discover. "feed": a few at the top of the feed while you follow
  // only a few people (feedShowsSuggestions).
  variant: "find" | "feed"
  className?: string
}

const FEED_SHOWN = 6
const heading = "text-xs font-semibold uppercase tracking-widest text-muted-foreground"

// People you may know (BOO-81): readers to follow, each with why. The ✕ dismisses someone for good,
// with Undo. The server decides who may turn up (lib/peopleSuggest.ts).
const PeopleYouMayKnow: FC<Props> = ({ variant, className }) => {
  const { user } = useUser()
  const key = user?.id ? `/api/users/suggestions?limit=${variant === "feed" ? FEED_SHOWN : 20}` : null
  const { data } = useSWR<Payload>(key, fetcher, { ...swrOptions, revalidateOnFocus: false })
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [state, setState] = useState<Record<string, { isFollowing: boolean; requested: boolean }>>({})

  if (!user?.id || !data) return null
  if (variant === "feed" && !feedShowsSuggestions(data.followingCount)) return null
  const people = data.people.filter((p) => !hidden.has(p.username))
  // The feed strip only shows when there's someone to offer; Find people always ends with the invite.
  if (variant === "feed" && people.length === 0) return null

  const follow = (person: PersonSuggestion) => {
    const current = state[person.username]
    axios.post(`/api/users/${encodeURIComponent(person.username)}/follow`)
      .then((res) => setState((s) => ({ ...s, [person.username]: { isFollowing: !!res.data.isFollowing, requested: !!res.data.requested } })))
      .catch(() => notify.error(current?.isFollowing ? "Couldn't unfollow. Try again." : "Couldn't follow. Try again.", { retry: () => follow(person) }))
  }

  const dismiss = (person: PersonSuggestion) => {
    const show = (on: boolean) => setHidden((h) => { const next = new Set(h); if (on) next.delete(person.username); else next.add(person.username); return next })
    show(false)
    notify.undo(`We won't suggest ${person.displayName || person.username} again.`, {
      onUndo: () => show(true),
      commit: () => {
        fetch("/api/users/suggestions/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: person.username }), keepalive: true })
          .catch(() => { show(true); notify.error("Couldn't dismiss that suggestion.") })
      },
    })
  }

  return (
    <section aria-labelledby={`pymk-${variant}`} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-4">
        <h2 id={`pymk-${variant}`} className={heading}>People you may know</h2>
        {variant === "feed" && (
          <Link href="/discover?find=people" className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4">See all</Link>
        )}
      </div>
      {people.length > 0 ? (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {people.map((person) => {
            const s = state[person.username] ?? { isFollowing: false, requested: false }
            const done = s.isFollowing || s.requested
            return (
              <li key={person.username} className="relative flex items-center justify-between gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 pr-9">
                <Link href={`/u/${person.username}`} className="flex items-center gap-3 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-[14px]" style={{ background: person.favColour || "#D92D2D" }}>
                    {person.image
                      ? <Image src={person.image} alt="" fill sizes="40px" className="object-cover" />
                      : <InitialAvatar username={person.username} favColour={person.favColour} />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium"><ReaderName reader={person} badge={person.staffBadge && <StaffSeal kind={person.staffBadge} size={18} pressable={false} className="ml-1 align-[-4px]" />} /></p>
                    <p className="truncate text-xs text-muted-foreground">{person.reason}</p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => follow(person)}
                  className={cn(
                    "shrink-0 h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    done ? "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900" : "bg-foreground text-background hover:opacity-90"
                  )}
                >
                  {followButtonLabel({ ...s, needsApproval: person.needsApproval, followsYou: person.followsYou })}
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(person)}
                  aria-label={`Don't suggest ${person.displayName || person.username}`}
                  title="Don't suggest"
                  className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-neutral-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-neutral-800"
                >
                  <X size={14} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No suggestions yet. They come from your clubs, your reading circles and the people you follow.</p>
      )}
      {variant === "find" && user.username && <InviteLine username={user.username} />}
    </section>
  )
}

// Contacts aren't uploaded, so the way to bring in a friend who isn't here is your own profile link.
const InviteLine: FC<{ username: string }> = ({ username }) => {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = `${window.location.origin}/u/${encodeURIComponent(username)}`
    const data = { title: `${username} on Bookmark`, text: `Read with me on Bookmark`, url }
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try { await navigator.share(data); return } catch (err) { if (err instanceof DOMException && err.name === "AbortError") return }
    }
    try { await copyText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { notify.error("Couldn't copy the link.") }
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      Can&apos;t find them?
      <button type="button" onClick={share} className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-4">
        <Share2 size={14} aria-hidden />{copied ? "Link copied" : "Share my invite link"}
      </button>
    </p>
  )
}

export default PeopleYouMayKnow
