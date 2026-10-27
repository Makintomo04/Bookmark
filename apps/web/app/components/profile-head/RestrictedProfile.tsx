import { FC } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import type { RestrictedProfile as RestrictedProfileData, RestrictedReason } from '@/lib/publicProfile'
import { StaffBadge, primaryButtonClass } from './ProfileHeader'
import TierAvatar from './TierAvatar'
import FollowButton from './FollowButton'
import ProfileMenu from './ProfileMenu'

interface RestrictedProfileProps {
  profile: RestrictedProfileData
  reason: Exclude<RestrictedReason, "unavailable">
  // null when signed out.
  viewer: { isFollowing: boolean; requested: boolean } | null
}

const COPY: Record<RestrictedProfileProps["reason"], { title: string; body: string }> = {
  private: { title: "This profile is private", body: "Their shelf, reviews and activity are only visible to them." },
  followers: { title: "This profile is for followers", body: "Ask to follow them. Once they accept, you'll see their shelf, reviews and activity." },
  blockedByViewer: { title: "You've blocked this reader", body: "Unblock them from the menu to see their profile again." },
}

// What a profile shows to someone who can't see it: who it belongs to, and nothing about their reading.
const RestrictedProfile: FC<RestrictedProfileProps> = ({ profile, reason, viewer }) => {
  const accent = profile.favColour || "#F13C3C"
  const copy = COPY[reason]

  return (
    <div className="w-full">
      <div className="h-20 sm:h-28 rounded-2xl" style={{ background: accent }} />
      <div className="px-4 sm:px-8">
        <div className="-mt-12 sm:-mt-14 flex items-end justify-between gap-4">
          {/* No tier frame: it would give away how many books they've read. */}
          <TierAvatar image={profile.image} username={profile.username} colour={accent} alt={`${profile.username}'s avatar`} booksRead={0} className="w-24 sm:w-28" />
          {viewer && <div className="pb-1"><ProfileMenu username={profile.username} isBlocked={reason === "blockedByViewer"} /></div>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="page-title break-words">{profile.username}</h1>
          {profile.staffBadge && <StaffBadge kind={profile.staffBadge} />}
        </div>

        <div className="mt-10 max-w-md rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
          <Lock size={20} className="text-muted-foreground" aria-hidden />
          <h2 className="mt-3 font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
          {reason === "followers" && (
            <div className="mt-5">
              {viewer
                ? <FollowButton username={profile.username} initialFollowing={viewer.isFollowing} initialRequested={viewer.requested} needsApproval />
                : <Link href="/register" className={primaryButtonClass}>Sign up to ask to follow</Link>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RestrictedProfile
