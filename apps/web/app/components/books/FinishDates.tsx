"use client"
import { FC } from 'react'
import { cn } from '@/lib/utils'

export interface FinishDatesValue {
  // Days as "2024-03-01"; "" when not filled in.
  finished: string
  started: string
  // "I don't remember when": the read is logged undated.
  unknown: boolean
}

// Today in the reader's own time zone, as a date input wants it.
export const todayDay = () => new Date().toLocaleDateString('en-CA')

export const defaultFinishDates = (): FinishDatesValue => ({ finished: todayDay(), started: "", unknown: false })

// What /api/books and /api/book-progress take: finishedOn and startedOn, null for "I don't remember".
export const finishDatesBody = (v: FinishDatesValue) => ({
  finishedOn: v.unknown || !v.finished ? null : v.finished,
  startedOn: v.unknown || !v.started ? null : v.started,
})

export const finishDatesProblem = (v: FinishDatesValue) =>
  !v.unknown && v.started && v.finished && v.started > v.finished ? "The start date is after the finish date" : null

export const dateInputClass = "h-11 pointer-fine:h-10 w-full rounded-md border border-input bg-background px-3 text-base pointer-fine:text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"

interface FinishDatesProps {
  value: FinishDatesValue
  onChange: (value: FinishDatesValue) => void
  disabled?: boolean
  // The start date, for adding a finished book. Finishing one you're reading already has it.
  withStart?: boolean
  idPrefix?: string
}

// When a book was finished (and started), defaulting to today, so a book logged late lands in the right
// month of stats and Wrapped. "I don't remember" files it undated: it counts toward totals but no year.
const FinishDates: FC<FinishDatesProps> = ({ value, onChange, disabled, withStart = false, idPrefix = "finish" }) => {
  const set = (patch: Partial<FinishDatesValue>) => onChange({ ...value, ...patch })
  const today = todayDay()
  const year = new Date().getFullYear()
  const problem = finishDatesProblem(value)
  const note = value.unknown
    ? "Counts toward your books read, but not toward any year's goal."
    : value.finished && Number(value.finished.slice(0, 4)) === year
      ? `Counts toward your ${year} reading goal.`
      : value.finished ? `Counted in ${value.finished.slice(0, 4)} in your stats.` : null

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-medium mb-2">When did you read it?</legend>
      <div className={cn("grid gap-3", withStart && "sm:grid-cols-2")}>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Finished</span>
          <input id={`${idPrefix}-finished`} type="date" value={value.unknown ? "" : value.finished} max={today} min="1900-01-01"
            disabled={value.unknown || disabled} onChange={(e) => set({ finished: e.target.value })} className={dateInputClass} />
        </label>
        {withStart && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Started <span className="text-muted-foreground/80">· optional</span></span>
            <input id={`${idPrefix}-started`} type="date" value={value.unknown ? "" : value.started} max={value.finished || today} min="1900-01-01"
              disabled={value.unknown || disabled} onChange={(e) => set({ started: e.target.value })} className={dateInputClass} />
          </label>
        )}
      </div>
      <label className="inline-flex w-fit items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={value.unknown} onChange={(e) => set({ unknown: e.target.checked })} className="size-4 accent-[var(--accent,currentColor)]" />
        I don&apos;t remember when
      </label>
      {problem
        ? <p role="alert" className="text-sm text-danger">{problem}</p>
        : note && <p className="text-sm text-muted-foreground">{note}</p>}
    </fieldset>
  )
}

export default FinishDates
