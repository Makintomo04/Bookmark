"use client"
import { FC } from 'react'
import { cn } from '@/lib/utils'
import type { Settings } from '@/app/hooks/useSettings'

export type Option<T extends string> = { value: T; label: string }

export const PROFILE_OPTIONS: Option<Settings["profileVisibility"]>[] = [
  { value: "PUBLIC", label: "Public" },
  { value: "FOLLOWERS", label: "Followers only" },
  { value: "PRIVATE", label: "Private" },
]
export const REVIEW_OPTIONS: Option<Settings["reviewVisibility"]>[] = [
  { value: "EVERYONE", label: "Everyone" },
  { value: "FOLLOWERS", label: "Followers" },
  { value: "ONLY_ME", label: "Only me" },
]
export const INVITE_OPTIONS: Option<Settings["buddyReadInvites"]>[] = [
  { value: "EVERYONE", label: "Anyone" },
  { value: "FOLLOWING", label: "People I follow" },
  { value: "NOBODY", label: "No one" },
]
export const LIST_OPTIONS: Option<Settings["defaultListVisibility"]>[] = [
  { value: "PRIVATE", label: "Private" },
  { value: "PUBLIC", label: "Public" },
]

export const PROFILE_HINT: Record<Settings["profileVisibility"], string> = {
  PUBLIC: "Anyone can see your shelf, and your profile can show up in search engines.",
  FOLLOWERS: "Only your followers see your shelf and activity. Others see your name and a Follow button.",
  PRIVATE: "Only you see your shelf. You're hidden from search and your activity stays out of feeds.",
}
export const INVITE_HINT: Record<Settings["buddyReadInvites"], string> = {
  EVERYONE: "Any reader can invite you by username.",
  FOLLOWING: "Only readers you follow can invite you by username.",
  NOBODY: "Nobody can invite you by username.",
}

export const Segmented = <T extends string>({ id, label, options, value, onChange, disabled }: {
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

export const Toggle: FC<{ label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void; disabled: boolean }> = ({ label, hint, checked, onChange, disabled }) => (
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
