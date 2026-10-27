"use client"
import { FC } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GENRES } from '@/lib/genres'
import type { Option } from '@bookmark/shared/settingsCopy'

// The options and hints live in packages/shared, so the mobile app's settings say the same.
export { INVITE_HINT, INVITE_OPTIONS, LIST_OPTIONS, PROFILE_HINT, PROFILE_OPTIONS, REVIEW_OPTIONS, type Option } from '@bookmark/shared/settingsCopy'

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

// Favourite genres as toggling pills, shared by onboarding and Settings.
export const GenreChips: FC<{ value: string[]; onChange: (value: string[]) => void; disabled: boolean; labelledBy: string }> = ({ value, onChange, disabled, labelledBy }) => (
  <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
    {GENRES.map((genre) => {
      const on = value.includes(genre.slug)
      return (
        <button
          key={genre.slug}
          type="button"
          aria-pressed={on}
          disabled={disabled}
          onClick={() => onChange(on ? value.filter((g) => g !== genre.slug) : [...value, genre.slug])}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
            on ? "border-brand-fill bg-brand-fill text-white" : "border-neutral-300 bg-background hover:border-brand dark:border-neutral-700"
          )}
        >
          {on && <Check size={14} aria-hidden />}
          {genre.label}
        </button>
      )
    })}
  </div>
)
