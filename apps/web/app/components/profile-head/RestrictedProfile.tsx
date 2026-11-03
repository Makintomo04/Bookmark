import { FC } from 'react'
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
      {/* No banner and no tier ring: either would say something about a reader who has chosen not to. */}
      <div className="flex items-center gap-4">
        <TierAvatar image={profile.image} username={profile.username} colour={accent} alt={`${name}'s avatar`} booksRead={0} thin className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <h1 className="page-title break-words">
            {name}
            {profile.staffBadge && <StaffSeal kind={profile.staffBadge} name={name} size={22} className="ml-2 align-[-2px]" />}
          </h1>
          {profile.displayName && <p className="mt-0.5 text-sm text-muted-foreground break-all">@{profile.username}</p>}
        </div>
        {viewer && <ProfileMenu username={profile.username} isBlocked={reason === "blockedByViewer"} />}
      </div>

      {reason !== "blockedByViewer" && (
        <div className="mt-5 flex sm:max-w-sm [&>*]:flex-1">
          {viewer
            ? <FollowButton username={profile.username} initialFollowing={viewer.isFollowing} initialRequested={viewer.requested} needsApproval followsYou={viewer.followsYou} />
            : <Link href="/register" className={primaryButtonClass}>Sign up to ask to follow</Link>}
        </div>
      )}

      {/* One line under a hairline, not a card. */}
      <div className="mt-10 flex max-w-md gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <Lock size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <h2 className="text-sm font-medium">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </div>
    </div>
  )
}

export default RestrictedProfile
