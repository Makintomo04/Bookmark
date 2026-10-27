"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { Loader2, Users } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { sameBook } from '@/lib/workKey'
import type { DiscoverBook } from '@/lib/openLibrary'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import { copyCoverLater, refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'

const base = "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const outline = "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"

// "Start a circle for this book" from a Discover book page: the book goes on the shelf (Want to read)
// if it isn't there, then straight to the new-circle form with it chosen.
const StartCircleButton: FC<{ book: DiscoverBook, className?: string }> = ({ book, className }) => {
  const { user } = useUser()
  const router = useRouter()
  const { books, mutate } = useBooks()
  const bookEntryModal = useBookEntryModal()
  const closeDetails = useBookDetailsModal((s) => s.onClose)
  const [isWorking, setIsWorking] = useState(false)

  if (!user?.id) {
    return (
      <Link href="/register" className={cn(base, outline, className)}>
        <Users size={14} aria-hidden />Start a reading circle
      </Link>
    )
  }

  const onShelf = Array.isArray(books) ? (books as Book[]).find((b) => sameBook(b, book)) : undefined
  const go = (bookId: string) => {
    closeDetails()
    router.push(`/circles/new?bookId=${bookId}`)
  }

  const start = () => {
    if (onShelf) {
      go(onShelf.id)
      return
    }
    // Progress needs a length; without one, the add-book flow asks for it (and can start the circle after).
    if (!book.pages) {
      bookEntryModal.onOpen(book)
      return
    }
    setIsWorking(true)
    axios.post("/api/books", {
      title: book.title,
      author: book.author,
      pages: book.pages,
      coverImgSrc: book.coverUrl || "",
      workKey: book.workKey,
      editionKey: book.editionKey ?? undefined,
      isbn13: book.isbn13 ?? undefined,
      isbn10: book.isbn10 ?? undefined,
      hardcoverId: book.hardcoverId ?? undefined,
      status: "NOT_STARTED",
    }).then(({ data: saved }) => {
      mutate()
      refreshAfterBookChange()
      copyCoverLater(saved?.id)
      go(saved.id)
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't add that book. Try again."), { retry: start })
      setIsWorking(false)
    })
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={isWorking}
      aria-label={`Start a reading circle for ${book.title}`}
      className={cn(base, outline, "disabled:opacity-60", className)}
    >
      {isWorking ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Users size={14} aria-hidden />}
      Start a reading circle
    </button>
  )
}

export default StartCircleButton
