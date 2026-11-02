"use client"
import { FC, useEffect, useState } from 'react'
import axios from 'axios'
import Modal from './Modal'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { notify, apiError } from '@/lib/notify'
import useBooks from '@/app/hooks/useBooks'
import useStartDateModal from '@/app/hooks/useStartDateModal'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { dateInputClass, todayDay } from '../books/FinishDates'
import type { BookReadEntry } from '@/app/hooks/useBookReads'

// Start acts at once and says "Started X" with Undo (BOO-92). A reader who began it yesterday, or last week,
// fixes the day here: the start date of the read in progress, which the book's own dates and the stats follow.
const StartDateModal: FC = () => {
  const { mutate } = useBooks({ onlyWhen: false })
  const { isOpen, bookId, bookTitle, onClose } = useStartDateModal()
  const [readId, setReadId] = useState<string | null>(null)
  const [started, setStarted] = useState(todayDay())
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !bookId) return
    setReadId(null)
    setStarted(todayDay())
    axios.get<BookReadEntry[]>(`/api/books/${bookId}/reads`).then(({ data }) => {
      const open = [...data].reverse().find((r) => r.status === "STARTED")
      if (!open) return
      setReadId(open.id)
      if (open.startedAt) setStarted(open.startedAt.slice(0, 10))
    }).catch((err) => notify.error(apiError(err, "Couldn't load this book's dates.")))
  }, [isOpen, bookId])

  const save = () => {
    if (!readId || !started) return
    setIsSaving(true)
    axios.patch(`/api/books/${bookId}/reads/${readId}`, { startedAt: started }).then(() => {
      mutate()
      refreshAfterBookChange()
      onClose()
    }).catch((err) => notify.error(apiError(err, "Couldn't change the start date. Try again.")))
      .finally(() => setIsSaving(false))
  }

  const body = (
    <div className="w-full px-6 flex flex-col gap-1.5">
      <Label htmlFor="start-date">Started on</Label>
      <input id="start-date" type="date" value={started} max={todayDay()} min="1900-01-01" disabled={isSaving || !readId}
        onChange={(e) => setStarted(e.target.value)} className={dateInputClass} />
    </div>
  )

  const footer = (
    <div className="w-full p-6 flex items-center justify-end gap-3">
      <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
      <Button onClick={save} loading={isSaving} disabled={!readId || !started}>Save date</Button>
    </div>
  )

  return <Modal title={bookTitle ? `When did you start ${bookTitle}?` : "When did you start it?"} body={body} footer={footer} onClose={onClose} isOpen={isOpen} disabled={isSaving} size="sm" compact />
}

export default StartDateModal
