"use client"
import { FC } from 'react'
import axios from 'axios'
import { notify } from '@/lib/notify'
import type { Book, Status } from '@prisma/client'
import useBooks from '@/app/hooks/useBooks'
import { DropdownMenuItem } from '../ui/dropdown-menu'

export type ShelfAction = "pause" | "resume" | "dnf" | "restart" | "wantToRead" | "notInterested"

const copy: Record<ShelfAction, { label: string, done: string, failed: string }> = {
  pause: { label: "Pause", done: "Paused", failed: "Couldn't pause this book" },
  resume: { label: "Resume reading", done: "Back to Currently reading", failed: "Couldn't resume this book" },
  dnf: { label: "Did not finish", done: "Moved to Did not finish", failed: "Couldn't move this book" },
  restart: { label: "Read again", done: "Started reading again", failed: "Couldn't start this book again" },
  wantToRead: { label: "Move to Want to read", done: "Moved to Want to read", failed: "Couldn't move this book" },
  notInterested: { label: "Will not read", done: "Moved to Will not read", failed: "Couldn't move this book" },
}

// The moves offered from each shelf. They match what /api/book-progress allows.
const MOVES: Record<Status, ShelfAction[]> = {
  NOT_STARTED: ["notInterested"],
  NOT_INTERESTED: ["wantToRead"],
  STARTED: ["pause", "dnf", "wantToRead"],
  PAUSED: ["resume", "dnf", "wantToRead"],
  COMPLETED: ["restart"],
  DNF: ["restart", "wantToRead"],
}

// Moves a book between shelves through /api/book-progress, which keeps its read history in step.
export async function moveBook(bookId: string, action: ShelfAction, extra: Record<string, unknown> = {}) {
  try {
    await axios.post("/api/book-progress", { id: bookId, action, ...extra })
    notify.success(copy[action].done)
    return true
  } catch (err) {
    const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined
    notify.error(message || copy[action].failed)
    return false
  }
}

// Shelf moves for a card's "more" menu.
const ShelfMenuItems: FC<{ book: Book }> = ({ book }) => {
  const { mutate: booksMutate } = useBooks()
  return (
    <>
      {MOVES[book.status].map((action) => (
        <DropdownMenuItem
          key={action}
          onClick={(e) => e.stopPropagation()}
          onSelect={() => { moveBook(book.id, action).then(() => booksMutate()) }}
        >
          {copy[action].label}
        </DropdownMenuItem>
      ))}
    </>
  )
}

export default ShelfMenuItems
