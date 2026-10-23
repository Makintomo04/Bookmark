"use client"
import { FC } from 'react'
import { BookOpen, Headphones, Tablet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '../ui/label'

import { FORMAT_OPTIONS, type FormatChoice } from '@bookmark/shared/bookFormat'

// The format rules live in packages/shared, so the mobile app's forms send the same.
export { formatPayload, type FormatChoice } from '@bookmark/shared/bookFormat'

const ICONS: Record<FormatChoice, typeof BookOpen> = { PRINT: BookOpen, EBOOK: Tablet, AUDIOBOOK: Headphones }
const CHOICES = FORMAT_OPTIONS.map((o) => ({ ...o, icon: ICONS[o.value] }))

const FormatPicker: FC<{ value: FormatChoice, onChange: (next: FormatChoice) => void, disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <div className="flex flex-col gap-2">
    <Label id="format-label">Format</Label>
    <div role="radiogroup" aria-labelledby="format-label" className="grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 p-1 max-w-sm">
      {CHOICES.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-sm transition",
            value === v
              ? "bg-background font-semibold shadow-sm ring-1 ring-neutral-300 dark:ring-neutral-700"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon size={14} aria-hidden /> {label}
        </button>
      ))}
    </div>
  </div>
)

export default FormatPicker
