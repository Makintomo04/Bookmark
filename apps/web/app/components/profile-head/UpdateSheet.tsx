"use client"
import { FC, FormEvent, useEffect, useState } from 'react'
import axios from 'axios'
import type { Book } from '@prisma/client'
import { Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { notify, apiError } from '@/lib/notify'
import {
  chapterAt, chapterPercent, entryOf, formatMinutes, locationPercent, progressPercent, progressScale, type ProgressEntry,
} from '@/lib/progress'
import useBooks from '@/app/hooks/useBooks'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
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
  // From sm up: how far down its container the card that opened it ends, so the panel sits under it.
  top: number
  onClose: () => void
}

// Logging progress from a Continue reading card on your profile in bands: a panel under the card from sm up,
// a sheet from the bottom on a phone. It opens on the unit you last logged this book in, with the field ready,
// so it's type and Enter. Finished asks for a rating, then shows what to read next.
const UpdateSheet: FC<UpdateSheetProps> = ({ book, top, onClose }) => {
  const { mutate } = useBooks()
  const scale = progressScale(book)
  const audio = scale.unit === 'MINUTES'
  const units: Unit[] = [audio ? 'time' : 'pages', 'percent', 'chapters', 'location']
  const entry = entryOf(book)
  const [unit, setUnit] = useState<Unit>(entry === 'PERCENT' ? 'percent' : entry === 'CHAPTERS' ? 'chapters' : entry === 'LOCATION' ? 'location' : audio ? 'time' : 'pages')
  const percentNow = progressPercent(book)
  const [value, setValue] = useState('')
  const [total, setTotal] = useState('')
  const [step, setStep] = useState<'log' | 'rate' | 'next'>('log')
  const [rating, setRating] = useState<number>(book.rating ?? 0)
  const [saving, setSaving] = useState(false)

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
      await post({ action: 'complete', ...(withRating && rating > 0 ? { rating } : {}) })
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
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-40 cursor-default bg-black/40 sm:bg-black/20" />
      <div role="dialog" aria-modal="true" aria-label={`Update ${book.title}`} style={{ '--sheet-top': `${top}px` } as React.CSSProperties}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-neutral-200 dark:border-neutral-800 bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl",
          // From sm up it spans the cards under the one that opened it, so it doesn't half-cover the next card.
          "sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-[var(--sheet-top)] sm:mt-2 sm:rounded-xl sm:pb-5",
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
              {/* "Ch" and "Loc" sit inside the field, as part of what you're typing. */}
              <label className="relative min-w-0 flex-1">
                {(unit === 'chapters' || unit === 'location') && (
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{unit === 'chapters' ? 'Ch' : 'Loc'}</span>
                )}
                <input autoFocus inputMode={unit === 'time' ? 'text' : 'numeric'} aria-label={UNIT_LABEL[unit]} value={value} onChange={(e) => setValue(e.target.value)}
                  placeholder={unit === 'time' ? 'h:mm' : undefined} className={cn(fieldClass, (unit === 'chapters' || unit === 'location') && (unit === 'chapters' ? "pl-10" : "pl-11"))} />
              </label>
              {of && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{of}</span>}
              {(unit === 'chapters' || unit === 'location') && (
                <>
                  <span className="shrink-0 text-sm text-muted-foreground">of</span>
                  <input inputMode="numeric" aria-label={unit === 'chapters' ? 'Chapters in your edition' : 'Locations in your edition'} value={total} onChange={(e) => setTotal(e.target.value)}
                    placeholder={unit === 'chapters' ? '14' : '5,120'} className={cn(fieldClass, "w-24 shrink-0")} />
                </>
              )}
            </div>
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
            <UpNext bare row />
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
