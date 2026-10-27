"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import moment from 'moment'
import type { Status } from '@prisma/client'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { notify, apiError } from '@/lib/notify'
import { formatMinutes } from '@/lib/progress'
import StarRating from '../StarRating'
import { Button } from '../ui/button'
import { dateInputClass, todayDay } from './FinishDates'
import type { BookReadEntry } from '@/app/hooks/useBookReads'

const formatDay = (date: Date | string) =>
  moment(date).format(moment(date).isSame(moment(), 'year') ? 'D MMMM' : 'D MMMM YYYY')

const day = (date: string | null) => (date ? date.slice(0, 10) : "")

const readRange = (start: string | null, end: string | null) =>
  start && end ? `${formatDay(start)} – ${formatDay(end)}`
    : start ? `Started ${formatDay(start)}`
    : end ? formatDay(end)
    : "No dates"

const isOpen = (status: Status) => status === "STARTED" || status === "PAUSED"

interface Draft { status: "COMPLETED" | "DNF"; started: string; finished: string; rating: number }

interface ReadHistoryProps {
  bookId: string
  bookStatus: Status
  reads: BookReadEntry[]
  // After any change: the new reads, so the caller can refresh its copy and the shelf.
  onChange: (reads: BookReadEntry[]) => void
}

// The book's reads, newest first, each editable (dates, and the rating for that read) and removable, with a
// form to log an earlier read. The book's own dates, read count and the stats follow (api/books/[bookId]/reads).
const ReadHistory: FC<ReadHistoryProps> = ({ bookId, bookStatus, reads, onChange }) => {
  // The read being edited, or "new" for an earlier read being added.
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ status: "COMPLETED", started: "", finished: "", rating: 0 })
  const [busy, setBusy] = useState(false)
  const history = reads.slice().reverse()
  const canAdd = bookStatus !== "NOT_STARTED" && bookStatus !== "NOT_INTERESTED"
  const today = todayDay()

  const edit = (read: BookReadEntry) => {
    setDraft({ status: read.status === "DNF" ? "DNF" : "COMPLETED", started: day(read.startedAt), finished: day(read.finishedAt), rating: read.rating ?? 0 })
    setEditing(read.id)
  }
  const startAdding = () => {
    setDraft({ status: "COMPLETED", started: "", finished: "", rating: 0 })
    setEditing("new")
  }

  const run = (request: Promise<{ data: BookReadEntry[] }>, done: string) => {
    setBusy(true)
    request.then(({ data }) => {
      onChange(data)
      setEditing(null)
      notify.success(done)
    }).catch((err) => notify.error(apiError(err, "Couldn't save that read. Try again."))).finally(() => setBusy(false))
  }

  const save = (read: BookReadEntry | null) => {
    if (draft.started && draft.finished && draft.started > draft.finished) return notify.error("The start date is after the finish date")
    const open = read && isOpen(read.status)
    const body = {
      startedAt: draft.started || null,
      ...(!open && { finishedAt: draft.finished || null, rating: draft.rating > 0 ? draft.rating : null }),
    }
    if (!read) run(axios.post(`/api/books/${bookId}/reads`, { status: draft.status, ...body }), "Read added")
    else run(axios.patch(`/api/books/${bookId}/reads/${read.id}`, body), "Read updated")
  }

  const remove = (read: BookReadEntry) => {
    if (!window.confirm("Remove this read from the book's history?")) return
    run(axios.delete(`/api/books/${bookId}/reads/${read.id}`), "Read removed")
  }

  const form = (read: BookReadEntry | null) => {
    const open = read && isOpen(read.status)
    return (
      <div className="flex flex-col gap-3 py-3">
        {!read && (
          <div role="radiogroup" aria-label="How it ended" className="flex gap-4 text-sm">
            {(["COMPLETED", "DNF"] as const).map((s) => (
              <label key={s} className="inline-flex items-center gap-2 cursor-pointer">
                <input type="radio" name="past-read-status" checked={draft.status === s} onChange={() => setDraft({ ...draft, status: s })} />
                {s === "COMPLETED" ? "Finished" : "Did not finish"}
              </label>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Started</span>
            <input type="date" value={draft.started} max={draft.finished || today} min="1900-01-01" disabled={busy}
              onChange={(e) => setDraft({ ...draft, started: e.target.value })} className={dateInputClass} />
          </label>
          {!open && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{draft.status === "DNF" ? "Stopped" : "Finished"}</span>
              <input type="date" value={draft.finished} max={today} min="1900-01-01" disabled={busy}
                onChange={(e) => setDraft({ ...draft, finished: e.target.value })} className={dateInputClass} />
            </label>
          )}
        </div>
        {!open && (
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Rating for this read</span>
            <StarRating value={draft.rating} onChange={(r) => setDraft({ ...draft, rating: r })} disabled={busy} size={18} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">Leave a date empty if you don&apos;t remember it.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => save(read)} disabled={busy}>{read ? "Save" : "Add read"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
        </div>
      </div>
    )
  }

  if (history.length === 0 && !canAdd) return null

  return (
    <section aria-labelledby="read-history">
      <div className="flex items-center justify-between gap-3">
        <h3 id="read-history" className="text-sm font-medium">Reading history</h3>
        {canAdd && editing !== "new" && (
          <button type="button" onClick={startAdding} disabled={busy} className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <Plus size={14} aria-hidden />Add an earlier read
          </button>
        )}
      </div>
      {editing === "new" && form(null)}
      <ol className="mt-2 flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {history.map((read) => editing === read.id ? <li key={read.id}>{form(read)}</li> : (
          <li key={read.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {read.status === "COMPLETED" ? "Finished"
                  : read.status === "DNF" ? `Did not finish${read.currentPercent != null ? ` · ${Math.round(read.currentPercent)}%` : read.stoppedAtMinute !== null ? ` · ${formatMinutes(read.stoppedAtMinute)}` : read.stoppedAtPage !== null ? ` · page ${read.stoppedAtPage}` : ""}`
                  : read.status === "PAUSED" ? "Paused"
                  : "Reading now"}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">{readRange(read.startedAt, read.finishedAt)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {read.rating ? <StarRating value={read.rating} readOnly size={14} label="Rating" className="mr-1" /> : null}
              <button type="button" onClick={() => edit(read)} disabled={busy} aria-label="Edit this read" className="rounded-md p-1.5 text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground">
                <Pencil size={14} aria-hidden />
              </button>
              {!isOpen(read.status) && (
                <button type="button" onClick={() => remove(read)} disabled={busy} aria-label="Remove this read" className="rounded-md p-1.5 text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-danger">
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default ReadHistory
