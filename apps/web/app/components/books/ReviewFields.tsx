"use client"
import { FC } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readableInk } from '@/lib/colour'

// Drawn rather than left to the browser: a native box takes its fill from the browser and OS theme, so it
// came out grey-filled on the light theme. A real input underneath keeps the keyboard and screen readers.
export const AccentCheckbox: FC<{ checked: boolean, onChange: (checked: boolean) => void, disabled?: boolean, accent: string, label: string }> =
  ({ checked, onChange, disabled, accent, label }) => (
    <label className={cn("inline-flex items-center gap-2", disabled ? "opacity-60" : "cursor-pointer")}>
      <span className="relative inline-flex size-4 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          style={checked ? { background: accent, borderColor: accent } : undefined}
          className="peer size-4 appearance-none rounded-[4px] border border-neutral-400 dark:border-neutral-600 bg-background transition-colors cursor-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <Check size={12} strokeWidth={3} aria-hidden style={{ color: readableInk(accent) }} className="pointer-events-none absolute inset-0 m-auto hidden peer-checked:block" />
      </span>
      {label}
    </label>
  )

export type ReviewValue = { review: string, reviewSpoiler: boolean, reviewPrivate: boolean }

export const EMPTY_REVIEW: ReviewValue = { review: "", reviewSpoiler: false, reviewPrivate: false }

// What a new finish sends: nothing when the box was left empty, so the API leaves the book's review alone.
export const reviewBody = (value: ReviewValue) => {
  const review = value.review.trim()
  return review ? { review, reviewSpoiler: value.reviewSpoiler, reviewPrivate: value.reviewPrivate } : {}
}

// The review a reader can leave wherever they finish or stop a book: the text, and whether it spoils or
// stays with them.
const ReviewFields: FC<{ value: ReviewValue, onChange: (next: ReviewValue) => void, disabled?: boolean, accent: string, id?: string }> =
  ({ value, onChange, disabled, accent, id = "review" }) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Review <span className="font-normal text-muted-foreground">· optional</span>
      </label>
      <textarea
        id={id}
        value={value.review}
        onChange={(e) => onChange({ ...value, review: e.target.value })}
        maxLength={2000}
        rows={4}
        placeholder="What did you think?"
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-base pointer-fine:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
      />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <AccentCheckbox checked={value.reviewSpoiler} onChange={(reviewSpoiler) => onChange({ ...value, reviewSpoiler })} disabled={disabled} accent={accent} label="Contains spoilers" />
        <AccentCheckbox checked={value.reviewPrivate} onChange={(reviewPrivate) => onChange({ ...value, reviewPrivate })} disabled={disabled} accent={accent} label="Only me" />
      </div>
    </div>
  )

export default ReviewFields
