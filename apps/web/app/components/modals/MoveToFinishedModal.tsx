"use client"
import { FC, useEffect, useState } from 'react'
import Modal from './Modal'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import StarRating from '../StarRating'
import { readableInk } from '@/lib/colour'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useMoveToFinishedModal from '@/app/hooks/useMoveToFinishedModal'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { celebrate } from '@/app/hooks/useEarnMoment'
import { reshelveBook } from '../books/ShelfMenuItems'
import FinishDates, { defaultFinishDates, finishDatesBody, finishDatesProblem, type FinishDatesValue } from '../books/FinishDates'
import { notify } from '@/lib/notify'

// A book on the wrong shelf that the reader has actually read: the same questions adding it to Finished asks.
const MoveToFinishedModal: FC = () => {
  const { user } = useUser()
  const { mutate } = useBooks()
  const { isOpen, bookId, bookTitle, onClose } = useMoveToFinishedModal()
  const [dates, setDates] = useState<FinishDatesValue>(defaultFinishDates)
  const [rating, setRating] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const colour = user?.favColour || '#D92D2D'

  useEffect(() => {
    if (!isOpen) return
    setDates(defaultFinishDates())
    setRating(0)
  }, [isOpen])

  const move = () => {
    const problem = finishDatesProblem(dates)
    if (problem) return notify.error(problem)
    setIsSaving(true)
    reshelveBook(bookId, "COMPLETED", { ...finishDatesBody(dates), rating: rating > 0 ? rating : undefined }).then((saved) => {
      if (!saved) return
      celebrate(saved.earnMoment, { message: "Moved to Finished" })
      mutate()
      refreshAfterBookChange()
      onClose()
    }).finally(() => setIsSaving(false))
  }

  const body = (
    <div className="w-full px-6 flex flex-col gap-5">
      <FinishDates value={dates} onChange={setDates} disabled={isSaving} withStart idPrefix="move-finish" />
      <div className="flex flex-col gap-2">
        <Label>Rating <span className="font-normal text-muted-foreground">· optional</span></Label>
        <StarRating value={rating} onChange={setRating} disabled={isSaving} />
      </div>
    </div>
  )

  const footer = (
    <div className="w-full p-6 flex items-center justify-end gap-3">
      <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
      <Button style={{ background: colour, color: readableInk(colour) }} onClick={move} disabled={isSaving}>Move to Finished</Button>
    </div>
  )

  return <Modal title={bookTitle ? `Move ${bookTitle} to Finished` : "Move to Finished"} body={body} footer={footer} onClose={onClose} isOpen={isOpen} disabled={isSaving} size="sm" compact />
}

export default MoveToFinishedModal
