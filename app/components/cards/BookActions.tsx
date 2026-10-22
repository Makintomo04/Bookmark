"use client"
import { FC } from 'react'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { removeBookWithUndo } from '../books/removeBookWithUndo'
import type { Book } from '@prisma/client'
import { Bookmark, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useFavourite from '@/app/hooks/useFavourite'
import useBookEditModal from '@/app/hooks/useBookEditModal'
import useBookNotesModal from '@/app/hooks/useBookNotesModal'
import useRecommendModal from '@/app/hooks/useRecommendModal'
import ShelfMenuItems from '../books/ShelfMenuItems'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const tones = {
  overlay: "bg-black/60 text-white hover:bg-black/80 focus-visible:ring-white",
  plain: "text-muted-foreground hover:text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800 focus-visible:ring-ring",
}

interface BookActionsProps {
  book: Book
  onUpdateProgress: () => void
  tone?: keyof typeof tones
  className?: string
}

const BookActions: FC<BookActionsProps> = ({ book, onUpdateProgress, tone = 'overlay', className }) => {
  const { mutate: mutateUser } = useUser()
  const { mutate: booksMutate } = useBooks()
  const { hasFavourited, mutate: mutateFav } = useFavourite()
  const bookEditModal = useBookEditModal()
  const bookNotesModal = useBookNotesModal()
  const recommendModal = useRecommendModal()
  const isFavourite = hasFavourited(book.id)
  const buttonClass = cn("h-8 w-8 rounded-full flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2", tones[tone])

  const toggleFavourite = () => {
    axios.post(`/api/favourites/${book.id}`).catch(() => {
      notify.error(isFavourite ? "Couldn't remove it from your favourites." : "Couldn't add it to your favourites.", { retry: toggleFavourite })
    }).finally(() => {
      mutateFav()
      mutateUser()
    })
  }

  const removeBook = () => removeBookWithUndo(book, booksMutate, mutateFav)

  return (
    // Menu items render in a portal but still bubble through React, so stop clicks reaching the card.
    <div onClick={(e) => e.stopPropagation()} className={cn("flex gap-1.5", className)}>
      <button
        type="button"
        aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
        aria-pressed={isFavourite}
        onClick={toggleFavourite}
        className={buttonClass}
      >
        <Bookmark size={16} className={cn(isFavourite && "fill-current", isFavourite && tone === 'plain' && "text-[#F13C3C]")} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`More actions for ${book.title}`} className={buttonClass}>
            <MoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onUpdateProgress}>Update progress</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => bookEditModal.onOpen(book)}>Edit details</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => bookNotesModal.onOpen(book.id, book.title)}>Notes</DropdownMenuItem>
          {book.status !== "NOT_INTERESTED" && (
            <DropdownMenuItem onSelect={() => recommendModal.onOpen(book.id, book.title)}>Send to a friend</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <ShelfMenuItems book={book} />
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={removeBook} className="text-danger focus:text-danger">Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default BookActions
