"use client"
import { FC } from 'react'
import { Send } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { sameBook } from '@/lib/workKey'
import type { DiscoverBook } from '@/lib/openLibrary'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useRecommendModal from '@/app/hooks/useRecommendModal'

const base = "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const outline = "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"

// "Send to a friend" from a book's page, whether or not it's on your shelf: a book you'd never read
// yourself can still be the one a friend's been waiting for. Your own copy is sent when you have one.
const SendToFriendButton: FC<{ book: DiscoverBook, bookKey: string, className?: string }> = ({ book, bookKey, className }) => {
  const { user } = useUser()
  const { books } = useBooks()
  const { onOpen, onOpenFromPage } = useRecommendModal()

  if (!user?.id) return null

  const onShelf = Array.isArray(books)
    ? (books as Book[]).find((b) => b.status !== "NOT_INTERESTED" && sameBook(b, book))
    : undefined
  const open = () => (onShelf ? onOpen(onShelf.id, book.title) : onOpenFromPage(bookKey, book.title))

  return (
    <button type="button" onClick={open} aria-label={`Send ${book.title} to a friend`} className={cn(base, outline, className)}>
      <Send size={14} aria-hidden />Send to a friend
    </button>
  )
}

export default SendToFriendButton
