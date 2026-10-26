"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { Check, ChevronDown, Loader2, Plus } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { sameBook } from '@/lib/workKey'
import type { DiscoverBook } from '@/lib/openLibrary'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import useMoveToFinishedModal from '@/app/hooks/useMoveToFinishedModal'
import { moveBook, reshelveBook } from '../books/ShelfMenuItems'
import { copyCoverLater, refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const base = "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const outline = "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"

// Which shelf the reader already has the book on, named as the shelf headings name them.
const SHELF_LABELS: Record<string, string> = {
  STARTED: "Reading",
  PAUSED: "Paused",
  NOT_STARTED: "Want to read",
  COMPLETED: "Finished",
  DNF: "Did not finish",
  NOT_INTERESTED: "Will not read",
}

// Want to read is one click; the chevron offers every shelf, for a book the reader is already reading
// or has read. Reading and Finished open the add-book modal on that shelf, which asks for the current
// page, or whether it was finished this year and a rating.
const SHELVES = [
  { status: "NOT_STARTED", label: "Want to read" },
  { status: "STARTED", label: "Reading" },
  { status: "COMPLETED", label: "Finished" },
  { status: "DNF", label: "Did not finish" },
] as const
type Shelf = (typeof SHELVES)[number]["status"]

const AddToShelfButton: FC<{ book: DiscoverBook, className?: string }> = ({ book, className }) => {
  const router = useRouter()
  const { user } = useUser()
  const { books, mutate } = useBooks()
  const bookEntryModal = useBookEntryModal()
  const moveToFinished = useMoveToFinishedModal()
  const [isAdding, setIsAdding] = useState(false)

  if (!user?.id) {
    return (
      <Link href="/register" className={cn(base, outline, className)}>
        <Plus size={14} aria-hidden />Want to read
      </Link>
    )
  }

  const onShelf = Array.isArray(books) ? (books as Book[]).find((b) => sameBook(b, book)) : undefined
  if (onShelf) {
    // Already shelved: the label opens the same shelves, so a book put on the wrong one can be moved.
    // A paused book is still being read, so Reading picks it back up rather than starting again.
    const current = onShelf.status === "PAUSED" ? "STARTED" : onShelf.status
    const moveTo = async (status: Shelf) => {
      if (status === "COMPLETED") return moveToFinished.onOpen(onShelf.id, onShelf.title)
      setIsAdding(true)
      // moveBook says what happened itself.
      if (onShelf.status === "PAUSED" && status === "STARTED") await moveBook(onShelf.id, "resume")
      else if (await reshelveBook(onShelf.id, status)) notify.success(`Moved to ${SHELF_LABELS[status]}`)
      mutate()
      refreshAfterBookChange()
      setIsAdding(false)
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isAdding}
          aria-label={`${book.title} is on ${SHELF_LABELS[onShelf.status] ?? "your shelf"}. Change shelf`}
          className={cn(base, "px-2.5 gap-1 whitespace-nowrap text-muted-foreground bg-neutral-100 dark:bg-neutral-900 hover:text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-60", className)}
        >
          {SHELF_LABELS[onShelf.status] ?? "On your shelf"}
          {isAdding ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Move to</DropdownMenuLabel>
          {SHELVES.map((s) => (
            <DropdownMenuItem key={s.status} disabled={s.status === current} onSelect={() => moveTo(s.status)} className="gap-2 cursor-pointer">
              <span className="flex-1">{s.label}</span>
              {s.status === current && <Check size={14} aria-label="Current shelf" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const addTo = (status: "NOT_STARTED" | "DNF") => {
    // Progress tracking needs a page count; without one, let the add-book flow ask for it.
    if (status === "NOT_STARTED" && !book.pages) {
      bookEntryModal.onOpen(book)
      return
    }
    const label = SHELF_LABELS[status]
    setIsAdding(true)
    axios.post("/api/books", {
      title: book.title,
      author: book.author,
      pages: book.pages ?? undefined,
      coverImgSrc: book.coverUrl || "",
      workKey: book.workKey,
      editionKey: book.editionKey ?? undefined,
      isbn13: book.isbn13 ?? undefined,
      isbn10: book.isbn10 ?? undefined,
      status,
    }).then(({ data: saved }) => {
      notify.success(`Added to ${label}`, { action: { label: "View shelf", onClick: () => router.push("/") } })
      mutate()
      refreshAfterBookChange()
      copyCoverLater(saved?.id)
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't add that book. Try again."), { retry: () => addTo(status) })
    }).finally(() => setIsAdding(false))
  }

  const chooseShelf = (status: Shelf) => {
    if (status === "NOT_STARTED" || status === "DNF") addTo(status)
    else bookEntryModal.onOpen(book, { shelf: status })
  }

  return (
    <div className={cn("inline-flex items-stretch rounded-full border border-neutral-300 dark:border-neutral-700", className)}>
      <button
        type="button"
        onClick={() => addTo("NOT_STARTED")}
        disabled={isAdding}
        aria-label={`Add ${book.title} to Want to read`}
        className={cn(base, "h-[30px] rounded-r-none pl-2.5 pr-1.5 whitespace-nowrap hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-60")}
      >
        {isAdding && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {isAdding ? "Adding…" : "Want to read"}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isAdding}
          aria-label={`Choose a shelf for ${book.title}`}
          className={cn(base, "h-[30px] rounded-l-none px-1 border-l border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-60")}
        >
          <ChevronDown size={14} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Add to</DropdownMenuLabel>
          {SHELVES.map((s) => (
            <DropdownMenuItem key={s.status} onSelect={() => chooseShelf(s.status)} className="cursor-pointer">
              {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default AddToShelfButton
