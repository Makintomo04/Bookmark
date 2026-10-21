"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import type { Book } from '@prisma/client'
import { Bookmark, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useFavourite from '@/app/hooks/useFavourite'
import useBookEditModal from '@/app/hooks/useBookEditModal'
import useBookNotesModal from '@/app/hooks/useBookNotesModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const tones = {
  overlay: "bg-black/60 text-white hover:bg-black/80 focus-visible:ring-white",
  plain: "text-muted-foreground hover:text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800 focus-visible:ring-neutral-400",
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
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const isFavourite = hasFavourited(book.id)
  const buttonClass = cn("h-8 w-8 rounded-full flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2", tones[tone])

  const toggleFavourite = () => {
    axios.post(`/api/favourites/${book.id}`).then(() => {
      toast.success(isFavourite ? "Removed from Favourites" : "Added to Favourites", { position: "bottom-center" })
    }).catch(() => {
      toast.error("Couldn't update favourites", { position: "bottom-center" })
    }).finally(() => {
      mutateFav()
      mutateUser()
    })
  }

  const removeBook = () => {
    axios.delete(`/api/books/${book.id}`).then(() => {
      toast.success(`Removed "${book.title}"`, { position: "bottom-center" })
    }).catch(() => {
      toast.error("Couldn't remove this book", { position: "bottom-center" })
    }).finally(() => {
      booksMutate()
      mutateFav()
    })
  }

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
      <DropdownMenu onOpenChange={(open) => { if (!open) setConfirmingRemove(false) }}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`More actions for ${book.title}`} className={buttonClass}>
            <MoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onUpdateProgress}>Update progress</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => bookEditModal.onOpen(book)}>Edit details</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => bookNotesModal.onOpen(book.id, book.title)}>Notes</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              if (!confirmingRemove) {
                e.preventDefault()
                setConfirmingRemove(true)
                return
              }
              removeBook()
            }}
            className="text-red-500 focus:text-red-500"
          >
            {confirmingRemove ? "Click again to remove" : "Remove"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default BookActions
