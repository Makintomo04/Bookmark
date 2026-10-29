import { FC } from 'react'
import { BLEED } from '../Container'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import type { RestrictedProfile as RestrictedProfileData, RestrictedReason } from '@/lib/publicProfile'
import { readerName } from '@/lib/profile'
import { primaryButtonClass } from './ProfileHeader'
import StaffSeal from './StaffSeal'
import TierAvatar from './TierAvatar'
import FollowButton from './FollowButton'
import ProfileMenu from './ProfileMenu'

interface RestrictedProfileProps {
  profile: RestrictedProfileData
  reason: Exclude<RestrictedReason, "unavailable">
  // null when signed out.
  viewer: { isFollowing: boolean; requested: boolean; followsYou: boolean } | null
}

const COPY: Record<RestrictedProfileProps["reason"], { title: string; body: string }> = {
  // Private is followers-only plus hidden from search and out of feeds (lib/privacyRules.ts).
  private: { title: "This profile is private", body: "Ask to follow them. If they accept, you'll see their shelf and reviews. Their activity never shows in feeds." },
  followers: { title: "This profile is for followers", body: "Ask to follow them. Once they accept, you'll see their shelf, reviews and activity." },
  blockedByViewer: { title: "You've blocked this reader", body: "Unblock them from the menu to see their profile again." },
}

// What a profile shows to someone who can't see it: who it belongs to, and nothing about their reading.
const RestrictedProfile: FC<RestrictedProfileProps> = ({ profile, reason, viewer }) => {
  const accent = profile.favColour || "#F13C3C"
  const copy = COPY[reason]
  const name = readerName(profile)

  return (
    <div className="w-full">
      <div className={`h-24 sm:h-44 sm:rounded-2xl ${BLEED}`} style={{ background: accent }} />
      <div>
        <div className="-mt-9 sm:-mt-14 flex items-end justify-between gap-4">
          {/* No tier frame: it would give away how many books they've read. */}
          <div className="relative shrink-0">
            <TierAvatar image={profile.image} username={profile.username} colour={accent} alt={`${name}'s avatar`} booksRead={0} className="size-24 sm:size-28" />
            {profile.staffBadge && <StaffSeal kind={profile.staffBadge} name={name} size={30} cutOut shine className="absolute right-0 bottom-[6%]" />}
          </div>
          {viewer && <div className="pb-1"><ProfileMenu username={profile.username} isBlocked={reason === "blockedByViewer"} /></div>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="page-title break-words">{name}</h1>
        </div>
        {profile.displayName && <p className="mt-0.5 text-sm text-muted-foreground break-all">@{profile.username}</p>}

        <div className="mt-10 max-w-md rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
          <Lock size={20} className="text-muted-foreground" aria-hidden />
          <h2 className="mt-3 font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
          {reason !== "blockedByViewer" && (
            <div className="mt-5">
              {viewer
                ? <FollowButton username={profile.username} initialFollowing={viewer.isFollowing} initialRequested={viewer.requested} needsApproval followsYou={viewer.followsYou} />
                : <Link href="/register" className={primaryButtonClass}>Sign up to ask to follow</Link>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RestrictedProfile
