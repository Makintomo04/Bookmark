"use client"
import { FC, useEffect, useState } from 'react'
import Modal from './Modal'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import StarRating from '../StarRating'
import { cn } from '@/lib/utils'
import { readableInk } from '@/lib/colour'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useMoveToFinishedModal from '@/app/hooks/useMoveToFinishedModal'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { celebrate } from '@/app/hooks/useEarnMoment'
import { reshelveBook } from '../books/ShelfMenuItems'

// A book on the wrong shelf that the reader has actually read: the same questions adding it to Finished asks.
const MoveToFinishedModal: FC = () => {
  const { user } = useUser()
  const { mutate } = useBooks()
  const { isOpen, bookId, bookTitle, onClose } = useMoveToFinishedModal()
  const [finishedThisYear, setFinishedThisYear] = useState(false)
  const [rating, setRating] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const year = new Date().getFullYear()
  const colour = user?.favColour || '#D92D2D'

  useEffect(() => {
    if (!isOpen) return
    setFinishedThisYear(false)
    setRating(0)
  }, [isOpen])

  const move = () => {
    setIsSaving(true)
    reshelveBook(bookId, "COMPLETED", { finishedThisYear, rating: rating > 0 ? rating : undefined }).then((saved) => {
      if (!saved) return
      celebrate(saved.earnMoment, { message: "Moved to Finished" })
      mutate()
      refreshAfterBookChange()
      onClose()
    }).finally(() => setIsSaving(false))
  }

  const body = (
    <div className="w-full px-6 flex flex-col gap-5">
      <button
        type="button"
        role="switch"
        aria-checked={finishedThisYear}
        onClick={() => setFinishedThisYear((v) => !v)}
        disabled={isSaving}
        className="flex items-start gap-3 text-left w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span
          className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", !finishedThisYear && "bg-neutral-300 dark:bg-neutral-700")}
          style={finishedThisYear ? { background: colour } : undefined}
        >
          <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", finishedThisYear && "translate-x-5")} />
        </span>
        <span>
          <span className="block text-sm font-medium">I finished this in {year}</span>
          <span className="block text-sm text-muted-foreground">Counts toward your {year} reading goal.</span>
        </span>
      </button>
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
