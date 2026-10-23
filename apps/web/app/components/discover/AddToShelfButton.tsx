"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { Check, Loader2, Plus } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { sameBook } from '@/lib/workKey'
import type { DiscoverBook } from '@/lib/openLibrary'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import { copyCoverLater, refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'

const base = "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const outline = "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"

const AddToShelfButton: FC<{ book: DiscoverBook, className?: string }> = ({ book, className }) => {
  const router = useRouter()
  const { user } = useUser()
  const { books, mutate } = useBooks()
  const bookEntryModal = useBookEntryModal()
  const [isAdding, setIsAdding] = useState(false)

  if (!user?.id) {
    return (
      <Link href="/register" className={cn(base, outline, className)}>
        <Plus size={14} aria-hidden />Want to read
      </Link>
    )
  }

  const onShelf = Array.isArray(books) && (books as Book[]).some((b) => sameBook(b, book))
  if (onShelf) {
    return (
      <span className={cn(base, "text-muted-foreground bg-neutral-100 dark:bg-neutral-900", className)}>
        <Check size={14} aria-hidden />On your shelf
      </span>
    )
  }

  const add = () => {
    // Progress tracking needs a page count; without one, let the add-book flow ask for it.
    if (!book.pages) {
      bookEntryModal.onOpen(book)
      return
    }
    setIsAdding(true)
    axios.post("/api/books", {
      title: book.title,
      author: book.author,
      pages: book.pages,
      coverImgSrc: book.coverUrl || "",
      workKey: book.workKey,
      editionKey: book.editionKey ?? undefined,
      isbn13: book.isbn13 ?? undefined,
      isbn10: book.isbn10 ?? undefined,
      status: "NOT_STARTED",
    }).then(({ data: saved }) => {
      notify.success("Added to Want to read", { action: { label: "View shelf", onClick: () => router.push("/") } })
      mutate()
      refreshAfterBookChange()
      copyCoverLater(saved?.id)
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't add that book. Try again."), { retry: add })
    }).finally(() => setIsAdding(false))
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={isAdding}
      aria-label={`Add ${book.title} to Want to read`}
      className={cn(base, outline, "disabled:opacity-60", className)}
    >
      {isAdding ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
      {isAdding ? "Adding…" : "Want to read"}
    </button>
  )
}

export default AddToShelfButton
