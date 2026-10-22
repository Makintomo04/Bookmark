"use client"
import { FC } from 'react'
import useSettings from '@/app/hooks/useSettings'
import { INVITE_HINT, INVITE_OPTIONS, LIST_OPTIONS, PROFILE_HINT, PROFILE_OPTIONS, REVIEW_OPTIONS, Segmented, Toggle } from './controls'

// Each setting saves as soon as it changes, separately from the profile form. The server enforces them (lib/privacy.ts).
const PrivacySettings: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { settings, save, pending } = useSettings()
  if (!settings) return null
  const busy = disabled || pending !== null

  return (
    <>
      <div className="rounded-lg border p-4 flex flex-col gap-5">
        <div>
          <p className="text-sm font-medium">Privacy</p>
          <p className="text-xs text-muted-foreground">Changes save straight away. Blocked readers never see your profile, whatever you choose here.</p>
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
          label="Hide follower and following counts"
          hint="No numbers on your profile, for you or anyone else, and your connection lists stay private."
          checked={settings.hideFollowCounts}
          onChange={(v) => save("hideFollowCounts", v)}
          disabled={busy}
        />
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
          label="Offer Catch me up recaps"
          hint="A short AI recap of the story so far when you come back to a book, or of the earlier books when you start the next in a series. Only you see them."
          checked={settings.showRecaps}
          onChange={(v) => save("showRecaps", v)}
          disabled={busy}
        />
      </div>
    </>
  )
}

export default PrivacySettings
