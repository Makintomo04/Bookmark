"use client"
import { FC } from 'react'
import { BookOpen, Headphones, Tablet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '../ui/label'

// The add and edit forms only need to know one thing: is this an audiobook? Print and ebook both run
// on pages; an audiobook runs on minutes listened and needs a running time.
export type FormatChoice = "PRINT" | "EBOOK" | "AUDIOBOOK"

const CHOICES: { value: FormatChoice, label: string, icon: typeof BookOpen }[] = [
  { value: "PRINT", label: "Print", icon: BookOpen },
  { value: "EBOOK", label: "Ebook", icon: Tablet },
  { value: "AUDIOBOOK", label: "Audiobook", icon: Headphones },
]

// What /api/books (POST and PATCH) takes: the catalog's EditionFormat, and the running time for an audiobook.
export function formatPayload(format: FormatChoice, runningTime: number) {
  return {
    format: format === "PRINT" ? "PAPERBACK" : format,
    audioMinutes: format === "AUDIOBOOK" && runningTime > 0 ? runningTime : undefined,
  }
}

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
