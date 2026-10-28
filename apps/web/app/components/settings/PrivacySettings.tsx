"use client"
import { FC } from 'react'
import useSettings from '@/app/hooks/useSettings'
import useUser from '@/app/hooks/useUser'
import { roleOf } from '@/lib/roles'
import FollowRequests from '../profile-head/FollowRequests'
import { INVITE_HINT, INVITE_OPTIONS, LIST_OPTIONS, PROFILE_HINT, PROFILE_OPTIONS, REVIEW_OPTIONS, Segmented, Toggle } from './controls'

// Each setting saves as soon as it changes, separately from the profile form. The server enforces them (lib/privacy.ts).
const PrivacySettings: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { settings, save, pending } = useSettings()
  const { user } = useUser()
  if (!settings) return null
  const busy = disabled || pending !== null

  return (
    <>
      <FollowRequests />
      <div className="rounded-lg border p-4 flex flex-col gap-5">
        <div>
          <p className="text-sm font-medium">Privacy</p>
          <p className="text-xs text-muted-foreground">Blocked readers never see your profile, whatever you choose here.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Segmented id="privacy-profile" label="Who can see your profile" options={PROFILE_OPTIONS} value={settings.profileVisibility} onChange={(v) => save("profileVisibility", v)} disabled={busy} />
          <p className="text-xs text-muted-foreground">{PROFILE_HINT[settings.profileVisibility]}</p>
        </div>
        <Segmented id="privacy-reviews" label="Who can read your reviews" options={REVIEW_OPTIONS} value={settings.reviewVisibility} onChange={(v) => save("reviewVisibility", v)} disabled={busy} />
        <Toggle
          label="Hide my Want to read shelf"
          hint="Others won't see what's on your list, or when you add to it."
          checked={settings.hideWantToRead}
          onChange={(v) => save("hideWantToRead", v)}
          disabled={busy}
        />
        <Toggle
          label="Keep Did not finish to myself"
          hint="Nobody else sees that shelf anyway. This also keeps “stopped reading” out of your followers' feeds."
          checked={settings.hideDidNotFinish}
          onChange={(v) => save("hideDidNotFinish", v)}
          disabled={busy}
        />
        <Toggle
          label="Hide follower and following counts"
          hint="No numbers on your profile, for you or anyone else, and your connection lists stay private."
          checked={settings.hideFollowCounts}
          onChange={(v) => save("hideFollowCounts", v)}
          disabled={busy}
        />
        <Toggle
          label="Hide my favourites"
          hint="The row of favourite books on your profile shows only to you. Private books never show there either way."
          checked={settings.hideFavourites}
          onChange={(v) => save("hideFavourites", v)}
          disabled={busy}
        />
        {/* The team's badge always shows, so only librarians get the choice. */}
        {roleOf(user) === "LIBRARIAN" && (
          <Toggle
            label="Hide my Librarian badge"
            hint="Your profile, reviews, comments, lists and notifications won't show that you're a librarian. Your librarian tools stay the same."
            checked={settings.hideStaffBadge}
            onChange={(v) => save("hideStaffBadge", v)}
            disabled={busy}
          />
        )}
      </div>
      <div className="rounded-lg border p-4 flex flex-col gap-5">
        <p className="text-sm font-medium">Community</p>
        <div className="flex flex-col gap-1.5">
          <Segmented id="community-invites" label="Who can invite you to reading circles" options={INVITE_OPTIONS} value={settings.buddyReadInvites} onChange={(v) => save("buddyReadInvites", v)} disabled={busy} />
          <p className="text-xs text-muted-foreground">{INVITE_HINT[settings.buddyReadInvites]} An invite link always works.</p>
        </div>
        <Segmented id="community-lists" label="New lists start as" options={LIST_OPTIONS} value={settings.defaultListVisibility} onChange={(v) => save("defaultListVisibility", v)} disabled={busy} />
        <Toggle
          label="Show spoilers in reviews"
          hint="Reviews marked as spoilers open straight away instead of staying covered."
          checked={settings.showSpoilers}
          onChange={(v) => save("showSpoilers", v)}
          disabled={busy}
        />
      </div>
      <div className="rounded-lg border p-4 flex flex-col gap-5">
        <div>
          <p className="text-sm font-medium">AI features</p>
          <p className="text-xs text-muted-foreground">Only ever for something you ask for, always labelled, and never about you.</p>
        </div>
        <Toggle
          label="Use AI features"
          hint="Ask the shelf, which finds books from a description in your own words, and Catch me up, a short recap of the story so far when you come back to a book (with Plus). Recaps are only for you. Off to start on a free account and on with Plus; switch it off any time."
          checked={settings.aiFeatures}
          onChange={(v) => save("aiFeatures", v)}
          disabled={busy}
        />
      </div>
    </>
  )
}

export default PrivacySettings
