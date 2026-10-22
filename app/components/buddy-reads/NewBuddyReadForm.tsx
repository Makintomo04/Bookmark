"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import moment from 'moment'
import { toast } from 'react-toastify'
import { ArrowLeft, Lock, Plus, X } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import useBooks from '@/app/hooks/useBooks'
import useBuddyReads from '@/app/hooks/useBuddyReads'
import { LABEL_MAX, SCHEDULE_MAX } from '@/lib/buddyReads'
import { formatLength, progressScale } from '@/lib/progress'
import BookCover from '../cards/BookCover'
import FetchErrorState from '../FetchErrorState'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'

// Books worth reading together: not ones already finished or given up on.
const SHELVES: Record<string, string> = { STARTED: "Reading", PAUSED: "Paused", NOT_STARTED: "Want to read" }

type Row = { label: string, until: string, due: string }

const inputClass = "h-9 w-full rounded-md border border-neutral-300 dark:border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const NewBuddyReadForm: FC<{ initialBookId?: string }> = ({ initialBookId }) => {
  const router = useRouter()
  const { books, isError, mutate } = useBooks()
  const { hosting } = useBuddyReads()
  const [bookId, setBookId] = useState<string | undefined>(initialBookId)
  const [startsOn, setStartsOn] = useState(moment().format("YYYY-MM-DD"))
  const [rows, setRows] = useState<Row[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const candidates = ((books ?? []) as Book[]).filter((b) => b.status in SHELVES)
  const chosen = candidates.find((b) => b.id === bookId)
  // Pages or minutes: either works, as long as the book has a length to measure progress against.
  const chosenHasLength = !!chosen && progressScale(chosen).total > 0
  const blocked = hosting !== null && !hosting.allowed

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const submit = () => {
    if (!chosen || isSaving) return
    const schedule = rows.filter((r) => r.label.trim()).map((r) => ({
      label: r.label.trim(),
      until: r.until === "" ? null : Math.max(0, Math.min(100, Number(r.until))),
      due: r.due || null,
    }))
    setIsSaving(true)
    axios.post("/api/buddy-reads", {
      bookId: chosen.id,
      // Local midnight on the chosen day.
      startsAt: moment(startsOn, "YYYY-MM-DD").toISOString(),
      schedule,
    }).then(({ data }) => {
      router.push(`/buddy-reads/${data.id}`)
    }).catch((err) => {
      toast.error(err?.response?.data?.error || "Couldn't start the circle.", { position: "bottom-center" })
      setIsSaving(false)
    })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Link href="/buddy-reads" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} aria-hidden /> Circles
        </Link>
        <h1 className="text-3xl font-bold">Start a circle</h1>
        <p className="text-muted-foreground">Choose a book from your shelf. You&apos;ll get a link to share; anyone with it can join, and the book goes on their shelf too.</p>
      </div>

      {blocked && (
        <p className="flex items-start gap-2 rounded-xl bg-neutral-100 dark:bg-neutral-900 px-4 py-3 text-sm">
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
          <span>{hosting.message} <Link href="/buddy-reads" className="font-medium underline underline-offset-4">See your circles</Link></span>
        </p>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium">Book</legend>
        {isError && !books ? (
          <FetchErrorState error={isError} what="your shelf" onRetry={() => mutate()} />
        ) : !books ? (
          <div className="h-24 rounded-xl bg-neutral-100 dark:bg-neutral-900 animate-pulse" aria-busy="true" />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a book to Want to read or Currently reading first, then come back.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto p-1 -m-1">
            {candidates.map((b) => (
              <li key={b.id}>
                <label className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  b.id === bookId ? "border-foreground bg-neutral-100 dark:bg-neutral-900" : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                )}>
                  <input type="radio" name="book" value={b.id} checked={b.id === bookId} onChange={() => setBookId(b.id)} className="sr-only" />
                  <BookCover book={b} variant="thumb" sizes="40px" className="w-10 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug line-clamp-2">{b.title}</span>
                    <span className="block text-xs text-muted-foreground truncate">{b.author} · {SHELVES[b.status]}{formatLength(b) ? ` · ${formatLength(b)}` : ""}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {chosen && !chosenHasLength && (
          <p className="text-sm text-rose-600 dark:text-rose-400">This book has no page count or running time, so progress can&apos;t be tracked. Add one from the book first.</p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 max-w-xs">
        <label htmlFor="starts-on" className="text-sm font-medium">Start date</label>
        <input id="starts-on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required className={inputClass} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Schedule <span className="font-normal text-muted-foreground">· optional</span></legend>
        <p className="text-sm text-muted-foreground">Checkpoints to read up to, as a percent so they work in any edition.</p>
        {rows.length > 0 && (
          <ol className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_72px_auto] sm:grid-cols-[minmax(0,1fr)_88px_150px_auto] items-center gap-2">
                <input aria-label={`Checkpoint ${i + 1} name`} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} maxLength={LABEL_MAX} placeholder="Chapters 1–5" className={inputClass} />
                <input aria-label={`Checkpoint ${i + 1} percent`} value={r.until} onChange={(e) => setRow(i, { until: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} inputMode="decimal" placeholder="25%" className={inputClass} />
                <input aria-label={`Checkpoint ${i + 1} due date`} type="date" value={r.due} onChange={(e) => setRow(i, { due: e.target.value })} className={cn(inputClass, "hidden sm:block")} />
                <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove checkpoint ${i + 1}`} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        )}
        {rows.length < SCHEDULE_MAX && (
          <button type="button" onClick={() => setRows([...rows, { label: "", until: "", due: "" }])} className={`${secondaryButtonClass} w-fit`}>
            <Plus size={16} aria-hidden /> Add a checkpoint
          </button>
        )}
      </fieldset>

      <div className="flex justify-end gap-3 border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <Link href="/buddy-reads" className={secondaryButtonClass}>Cancel</Link>
        <button type="submit" disabled={!chosen || !chosenHasLength || blocked || isSaving} className={primaryButtonClass}>
          {isSaving ? "Starting…" : "Start and get the link"}
        </button>
      </div>
    </form>
  )
}

export default NewBuddyReadForm
