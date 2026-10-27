import { FC } from 'react'
import { cn } from '@/lib/utils'

// "Page | %" (or "Min | %" for an audiobook): how the reader types their place. Kindle shows a percent,
// not a page, so a Kindle reader picks % once and the book remembers it (Book.logsPercent).
const ProgressModeToggle: FC<{ inPercent: boolean, onChange: (inPercent: boolean) => void, onMinutes: boolean, disabled?: boolean }> =
  ({ inPercent, onChange, onMinutes, disabled }) => {
    const option = (label: string, ariaLabel: string, active: boolean, value: boolean) => (
      <button
        type="button"
        aria-pressed={active}
        aria-label={ariaLabel}
        onClick={() => onChange(value)}
        disabled={disabled}
        className={cn(
          "h-8 sm:h-7 min-w-[2.75rem] rounded-full px-2.5 text-sm font-medium transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-white dark:bg-neutral-900 shadow-sm" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {label}
      </button>
    )
    return (
      <div role="group" aria-label="Log progress in" className="inline-flex shrink-0 gap-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700/60 p-0.5">
        {option(onMinutes ? "Min" : "Page", onMinutes ? "Minutes" : "Pages", !inPercent, false)}
        {option("%", "Percent", inPercent, true)}
      </div>
    )
  }

export default ProgressModeToggle
