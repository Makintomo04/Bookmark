"use client"
import { FC, FormEvent, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import type { Book } from '@prisma/client'
import { Check, Loader2, Minus, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { notify, apiError } from '@/lib/notify'
import {
  PERCENT_QUICK_ADDS, QUICK_ADDS, chapterAt, chapterPercent, entryOf, formatMinutes, locationPercent, progressPercent, progressScale, type ProgressEntry,
} from '@/lib/progress'
import useBooks from '@/app/hooks/useBooks'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { useRemindersPrompt } from '@/app/hooks/useEarnMoment'
import StarRating from '../StarRating'
import UpNext from './UpNext'
import { primaryButtonClass } from './ProfileHeader'

// The ways a place can be said: on the book's own scale (pages, or time for an audiobook), or as a percent,
// a chapter or a Kindle location, which are all stored as a percent (lib/progress.ts).
type Unit = 'pages' | 'time' | 'percent' | 'chapters' | 'location'
const UNIT_LABEL: Record<Unit, string> = { pages: 'Pages', time: 'Time', percent: 'Percent', chapters: 'Chapters', location: 'Location' }
const ENTRY_OF: Record<Unit, ProgressEntry> = { pages: 'PAGES', time: 'PAGES', percent: 'PERCENT', chapters: 'CHAPTERS', location: 'LOCATION' }

// One corner radius (rounded-lg) for the tabs, fields and buttons in the sheet.
const fieldClass = "h-11 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-background px-3 text-base tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

// The sheet's buttons: a full-width 44px target on a phone, the usual size from sm up, all rounded-lg.
const sheetButton = "h-11 w-full rounded-lg sm:h-9 sm:w-auto"
const ghostClass = "inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-neutral-100 hover:text-foreground disabled:opacity-60 dark:hover:bg-neutral-900 sm:h-9 sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

// "3:23" or "203" (minutes) → minutes; NaN when it isn't either.
const parseTime = (raw: string) => {
  const m = raw.trim().match(/^(\d+):([0-5]?\d)$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number(raw)
}

// 203 → "3:23", the way the time field takes it.
const toClock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`

// The body that puts the book back where it was, for Undo.
const placeOf = (book: Book) => book.currentPercent != null
  ? { currentPercent: book.currentPercent, currentChapter: book.currentChapter ?? undefined, currentLocation: book.currentLocation ?? undefined }
  : progressScale(book).unit === 'MINUTES' ? { currentMinute: book.currentMinute ?? 0 } : { currentPage: book.currentPage ?? 0 }

interface UpdateSheetProps {
  book: Book
  // 'rate' opens on "How was it?", for Finished from a card's menu.
  startAt?: 'log' | 'rate'
  onClose: () => void
}

// Logging progress from a Continue reading card on your profile in bands: a modal from sm up,
// a sheet from the bottom on a phone. It opens on the unit you last logged this book in, with the field ready,
// so it's type and Enter. Finished asks for a rating, then shows what to read next.
const UpdateSheet: FC<UpdateSheetProps> = ({ book, startAt = 'log', onClose }) => {
  const { mutate } = useBooks()
  const scale = progressScale(book)
  const audio = scale.unit === 'MINUTES'
  const units: Unit[] = [audio ? 'time' : 'pages', 'percent', 'chapters', 'location']
  const entry = entryOf(book)
  // A book started before its page count was known (Up next's Start) opens on Percent rather than "of ?" pages.
  const [unit, setUnit] = useState<Unit>(entry === 'PERCENT' ? 'percent' : entry === 'CHAPTERS' ? 'chapters' : entry === 'LOCATION' ? 'location' : audio ? 'time' : scale.total ? 'pages' : 'percent')
  const percentNow = progressPercent(book)
  const [value, setValue] = useState('')
  const [total, setTotal] = useState('')
  const [step, setStep] = useState<'log' | 'rate' | 'next'>(startAt)
  const [rating, setRating] = useState<number>(book.rating ?? 0)
  const [saving, setSaving] = useState(false)
  // A first finish offers reminders (RemindersSheet), once this sheet has closed rather than over Up next.
  const askReminders = useRef(false)
  useEffect(() => () => { if (askReminders.current) useRemindersPrompt.getState().ask() }, [])

  // Each unit opens on where you are now, said its way.
  useEffect(() => {
    if (unit === 'pages') setValue(String(book.currentPage ?? 0))
    if (unit === 'time') setValue(toClock(book.currentMinute ?? 0))
    if (unit === 'percent') setValue(String(Math.round(percentNow)))
    if (unit === 'chapters') {
      setTotal(book.chapters ? String(book.chapters) : '')
      setValue(book.chapters ? String(book.currentChapter || chapterAt(percentNow, book.chapters)) : '')
    }
    if (unit === 'location') {
      setTotal(book.locations ? String(book.locations) : '')
      setValue(book.currentLocation != null ? String(book.currentLocation) : '')
    }
  }, [unit, book, percentNow])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The stepper and the quick adds (+10 pages, +10%) from the old update modal: they move what's typed, and
  // Save still decides. Held inside 0 (1 for chapters) and the book's own end, where it has one.
  const bump = (by: number) => {
    const now = unit === 'time' ? parseTime(value) : Number(value)
    const end = unit === 'percent' ? 100 : unit === 'pages' || unit === 'time' ? scale.total || Infinity : Number(total) || Infinity
    const next = Math.min(Math.max((Number.isFinite(now) ? now : 0) + by, unit === 'chapters' ? 1 : 0), end)
    setValue(unit === 'time' ? toClock(Math.round(next)) : String(Math.round(next * 100) / 100))
  }
  const quickAdds = unit === 'percent' ? PERCENT_QUICK_ADDS : unit === 'pages' ? QUICK_ADDS.PAGES : unit === 'time' ? QUICK_ADDS.MINUTES : []
  const stepClass = "grid size-11 shrink-0 place-items-center rounded-lg border border-neutral-300 text-foreground transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900 sm:size-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  const post = (body: Record<string, unknown>) => axios.post('/api/book-progress', { id: book.id, ...body })
  const refresh = async () => { await mutate(); refreshAfterBookChange() }

  // The body for what's typed, or an error to show.
  const bodyFor = (): Record<string, unknown> | string => {
    const n = unit === 'time' ? parseTime(value) : Number(value)
    if (!Number.isFinite(n) || n < 0) return "Enter a number"
    if (unit === 'pages') return { currentPage: Math.round(n) }
    if (unit === 'time') return { currentMinute: Math.round(n) }
    if (unit === 'percent') return n > 100 ? "That's more than 100%" : { currentPercent: n }
    const t = Number(total)
    if (!(t > 0)) return unit === 'chapters' ? "How many chapters does it have?" : "How many locations does it have?"
    if (n > t) return `That's past the last ${unit === 'chapters' ? 'chapter' : 'location'}`
    if (unit === 'chapters') return n < 1 ? "Chapters start at 1" : { currentPercent: chapterPercent(n, t), currentChapter: Math.round(n), chapters: Math.round(t) }
    return { currentPercent: locationPercent(n, t), currentLocation: Math.round(n), locations: Math.round(t) }
  }

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    const body = bodyFor()
    if (typeof body === 'string') return notify.error(body)
    const before = placeOf(book)
    setSaving(true)
    try {
      await post({ action: 'progress', logsIn: ENTRY_OF[unit], ...body })
      await refresh()
      onClose()
      notify.success(`${book.title}: saved`, {
        action: { label: 'Undo', onClick: () => { post({ action: 'progress', ...before }).then(refresh).catch((err) => notify.error(apiError(err, "Couldn't undo that"))) } },
      })
    } catch (err) {
      notify.error(apiError(err, "Couldn't save your place. Try again."))
    } finally {
      setSaving(false)
    }
  }

  const finish = async (withRating: boolean) => {
    setSaving(true)
    try {
      const { data } = await post({ action: 'complete', ...(withRating && rating > 0 ? { rating } : {}) })
      askReminders.current = !!data?.askReminders
      await refresh()
      setStep('next')
    } catch (err) {
      notify.error(apiError(err, "Couldn't mark it finished. Try again."))
    } finally {
      setSaving(false)
    }
  }

  const of = unit === 'pages' ? `of ${scale.total || '?'}` : unit === 'time' ? `of ${formatMinutes(scale.total)}` : unit === 'percent' ? '%' : null

  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-40 cursor-default bg-black/40 sm:bg-black/50" />
      <div role="dialog" aria-modal="true" aria-label={`Update ${book.title}`}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-neutral-200 dark:border-neutral-800 bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl",
          // From sm up it's a modal in the middle of the screen; below that, a sheet from the bottom.
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-5",
        )}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{step === 'log' ? 'Update progress' : step === 'rate' ? 'Finished' : 'What’s next?'}</p>
            <p className="line-clamp-2 font-semibold leading-snug">{book.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-900"><X size={18} aria-hidden /></button>
        </div>

        {step === 'log' && (
          <form onSubmit={save}>
            <div role="tablist" aria-label="Log in" className="mb-4 flex gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 p-1">
              {units.map((u) => (
                <button key={u} type="button" role="tab" aria-selected={u === unit} onClick={() => setUnit(u)}
                  className={cn("h-11 flex-1 rounded-md text-xs font-medium transition sm:h-9", u === unit ? "bg-background text-foreground shadow-sm dark:bg-neutral-700" : "text-muted-foreground hover:text-foreground")}>
                  {UNIT_LABEL[u]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => bump(-1)} aria-label={`One ${unit === 'percent' ? 'percent' : unit === 'time' ? 'minute' : unit === 'pages' ? 'page' : unit === 'chapters' ? 'chapter' : 'location'} back`} className={stepClass}><Minus size={16} aria-hidden /></button>
              {/* "Ch" and "Loc" sit inside the field, as part of what you're typing. */}
              <label className="relative min-w-0 flex-1">
                {(unit === 'chapters' || unit === 'location') && (
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{unit === 'chapters' ? 'Ch' : 'Loc'}</span>
                )}
                <input autoFocus inputMode={unit === 'time' ? 'text' : 'numeric'} aria-label={UNIT_LABEL[unit]} value={value} onChange={(e) => setValue(e.target.value)}
                  placeholder={unit === 'time' ? 'h:mm' : undefined} className={cn(fieldClass, (unit === 'chapters' || unit === 'location') && (unit === 'chapters' ? "pl-10" : "pl-11"))} />
              </label>
              <button type="button" onClick={() => bump(1)} aria-label={`One ${unit === 'percent' ? 'percent' : unit === 'time' ? 'minute' : unit === 'pages' ? 'page' : unit === 'chapters' ? 'chapter' : 'location'} forward`} className={stepClass}><Plus size={16} aria-hidden /></button>
              {of && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{of}</span>}
              {(unit === 'chapters' || unit === 'location') && (
                <>
                  <span className="shrink-0 text-sm text-muted-foreground">of</span>
                  <input inputMode="numeric" aria-label={unit === 'chapters' ? 'Chapters in your edition' : 'Locations in your edition'} value={total} onChange={(e) => setTotal(e.target.value)}
                    placeholder={unit === 'chapters' ? '14' : '5,120'} className={cn(fieldClass, "w-24 shrink-0")} />
                </>
              )}
            </div>
            {quickAdds.length > 0 && (
              <div className="mt-3 flex gap-1.5">
                {quickAdds.map((n) => (
                  <button key={n} type="button" onClick={() => bump(n)} aria-label={`Add ${n} ${unit === 'percent' ? 'percent' : unit === 'time' ? 'minutes' : 'pages'}`}
                    className="h-10 rounded-full bg-neutral-100 px-3.5 text-sm font-medium tabular-nums transition hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 sm:h-8 sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    +{n}{unit === 'percent' && '%'}{unit === 'time' && 'm'}
                  </button>
                ))}
              </div>
            )}
            {unit === 'chapters' && <p className="mt-2 text-xs text-muted-foreground">The chapter you&apos;re on. Your circle sees chapters too.</p>}
            {/* Mark finished is a quiet way out, not a second answer beside Save, so it doesn't read as Cancel. */}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setStep('rate')} className={ghostClass}><Check size={15} aria-hidden />Mark finished</button>
              <button type="submit" disabled={saving} className={cn(primaryButtonClass, sheetButton)}>
                {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}Save
              </button>
            </div>
          </form>
        )}

        {step === 'rate' && (
          <div>
            <p className="text-sm text-muted-foreground">How was it?</p>
            <StarRating value={rating} onChange={setRating} size={32} className="mt-2" />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" disabled={saving} onClick={() => finish(false)} className={ghostClass}>Skip rating</button>
              <button type="button" disabled={saving} onClick={() => finish(true)} className={cn(primaryButtonClass, sheetButton)}>
                {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}Mark as finished
              </button>
            </div>
          </div>
        )}

        {step === 'next' && (
          <div>
            <UpNext bare row after={book} />
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className={cn(primaryButtonClass, sheetButton)}>Done</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default UpdateSheet
