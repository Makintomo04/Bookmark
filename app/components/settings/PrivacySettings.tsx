"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useSWRConfig } from 'swr'
import { cn } from '@/lib/utils'
import { privacyOf, type PrivacySettings as Settings } from '@/lib/privacyRules'
import useUser from '@/app/hooks/useUser'

type Option<T extends string> = { value: T; label: string }

const PROFILE_OPTIONS: Option<Settings["profileVisibility"]>[] = [
  { value: "PUBLIC", label: "Public" },
  { value: "FOLLOWERS", label: "Followers only" },
  { value: "PRIVATE", label: "Private" },
]
const REVIEW_OPTIONS: Option<Settings["reviewVisibility"]>[] = [
  { value: "EVERYONE", label: "Everyone" },
  { value: "FOLLOWERS", label: "Followers" },
  { value: "ONLY_ME", label: "Only me" },
]

const PROFILE_HINT: Record<Settings["profileVisibility"], string> = {
  PUBLIC: "Anyone can see your shelf, and your profile can show up in search engines.",
  FOLLOWERS: "Only your followers see your shelf and activity. Others see your name and a Follow button.",
  PRIVATE: "Only you see your shelf. You're hidden from search and your activity stays out of feeds.",
}

const Segmented = <T extends string>({ id, label, options, value, onChange, disabled }: {
  id: string
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  disabled: boolean
}) => (
  <div className="flex flex-col gap-2">
    <span id={id} className="text-sm font-medium">{label}</span>
    <div role="radiogroup" aria-labelledby={id} className="inline-flex self-start flex-wrap rounded-full bg-neutral-100 dark:bg-neutral-900 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => value !== o.value && onChange(o.value)}
          className={cn(
            "h-8 px-3.5 rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
            value === o.value ? "bg-background dark:bg-neutral-700 shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
)

const Toggle: FC<{ label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void; disabled: boolean }> = ({ label, hint, checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="flex items-start justify-between gap-4 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
  >
    <span>
      <span className="block text-sm font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </span>
    <span className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-foreground" : "bg-neutral-300 dark:bg-neutral-700")}>
      <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform", checked && "translate-x-5")} />
    </span>
  </button>
)

// Each setting saves as soon as it changes, separately from the profile form. The server enforces them (lib/privacy.ts).
const PrivacySettings: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { user, mutate } = useUser()
  const { mutate: mutateAll } = useSWRConfig()
  const [pending, setPending] = useState<keyof Settings | null>(null)
  if (!user) return null
  const settings = privacyOf(user)

  const save = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setPending(key)
    // Optimistic: the control moves straight away and rolls back if the save fails.
    mutate({ ...user, [key]: value }, { revalidate: false })
    axios.patch("/api/user/privacy", { [key]: value })
      .then((res) => {
        mutate({ ...user, ...res.data }, { revalidate: false })
        // Your own profile payload (counts, reviews) depends on these.
        mutateAll((k) => typeof k === "string" && k.startsWith("/api/users/") && !k.includes("/search"))
      })
      .catch(() => {
        mutate(user, { revalidate: false })
        toast.error("Couldn't save that setting. Try again.", { position: "bottom-center" })
      })
      .finally(() => setPending(null))
  }

  const busy = disabled || pending !== null

  return (
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
  )
}

export default PrivacySettings
