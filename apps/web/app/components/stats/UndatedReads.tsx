"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { notify, apiError } from '@/lib/notify'
import BookCover from '../cards/BookCover'
import { Button } from '../ui/button'
import { dateInputClass, todayDay } from '../books/FinishDates'

interface UndatedRead {
  id: string
  startedAt: string | null
  book: { id: string; title: string; author: string; coverImage: string; cardColour: string | null; workKey: string | null }
}

// One row per undated finish: pick a day, save, and it drops off the list into that month's stats.
const UndatedReads: FC<{ reads: UndatedRead[] }> = ({ reads }) => {
  const router = useRouter()
  const [days, setDays] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const today = todayDay()
  const left = reads.filter((r) => !done.has(r.id))

  const save = (read: UndatedRead) => {
    const day = days[read.id]
    if (!day) return
    setSaving(read.id)
    axios.patch(`/api/books/${read.book.id}/reads/${read.id}`, { finishedAt: day }).then(() => {
      setDone((prev) => new Set(prev).add(read.id))
      router.refresh()
    }).catch((err) => notify.error(apiError(err, "Couldn't save that date. Try again."))).finally(() => setSaving(null))
  }

  if (left.length === 0) {
    return <p className="mt-8 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-6 text-center text-sm text-muted-foreground">Every finish has a date. Your stats are complete.</p>
  }

  return (
    <>
      <p className="mt-6 text-sm text-muted-foreground tabular-nums">{left.length.toLocaleString('en-GB')} {left.length === 1 ? "finish" : "finishes"} without a date</p>
      <ul className="mt-3 flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {left.map((read) => (
          <li key={read.id} className="flex flex-wrap items-center gap-4 py-4">
            <BookCover book={read.book} variant="thumb" sizes="40px" className="w-10 shrink-0 shadow-sm" />
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug break-words">{read.book.title}</p>
              <p className="text-sm text-muted-foreground">{read.book.author}</p>
            </div>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(read) }}>
              <label className="sr-only" htmlFor={`undated-${read.id}`}>Day you finished {read.book.title}</label>
              <input id={`undated-${read.id}`} type="date" max={today} min={read.startedAt?.slice(0, 10) ?? "1900-01-01"}
                value={days[read.id] ?? ""} onChange={(e) => setDays({ ...days, [read.id]: e.target.value })}
                className={`${dateInputClass} w-40`} />
              <Button type="submit" size="sm" variant="outline" disabled={!days[read.id]} loading={saving === read.id}>Save</Button>
            </form>
          </li>
        ))}
      </ul>
    </>
  )
}

export default UndatedReads
