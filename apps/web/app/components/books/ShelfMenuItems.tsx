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

// Makes a book private (only the reader sees it, on whatever shelf it's on) or shares it again.
export async function setBookPrivacy(bookId: string, isPrivate: boolean) {
  try {
    await axios.put(`/api/books/${bookId}/privacy`, { isPrivate })
    notify.success(isPrivate ? "Private: only you can see this book" : "Shared on your profile again")
    return true
  } catch {
    notify.error(isPrivate ? "Couldn't make this book private" : "Couldn't share this book")
    return false
  }
}

// Shelf moves for a card's "more" menu, then the private toggle. Will not read is always private, so it
// has no toggle.
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
      {book.status !== "NOT_INTERESTED" && (
        <DropdownMenuItem
          onClick={(e) => e.stopPropagation()}
          onSelect={() => { setBookPrivacy(book.id, !book.isPrivate).then(() => booksMutate()) }}
        >
          {book.isPrivate ? "Share on profile" : "Make private"}
        </DropdownMenuItem>
      )}
    </>
  )
}

export default ShelfMenuItems
