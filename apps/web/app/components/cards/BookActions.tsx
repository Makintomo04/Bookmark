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
import { withFavourite } from '@/lib/favourites'
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
  // false when the card shows its own favourite control (BookCoverCard's FavouriteChip), so there's one, not two.
  favourite?: boolean
  className?: string
}

export const useToggleFavourite = (book: Pick<Book, 'id'>) => {
  const { mutate: mutateUser } = useUser()
  const { hasFavourited, mutate: mutateFav } = useFavourite()
  const isFavourite = hasFavourited(book.id)
  // Flips straight away rather than after the request and a refetch (about half a second), and rolls back if it
  // fails. The POST answers with the user, favouriteIds and all, so that becomes the cache without a second fetch.
  const toggleFavourite = () => {
    mutateFav(
      async () => (await axios.post(`/api/favourites/${book.id}`)).data,
      {
        optimisticData: (current: { favouriteIds?: string[] } | undefined) => {
          const ids = current?.favouriteIds ?? []
          return { ...current, favouriteIds: isFavourite ? ids.filter((id) => id !== book.id) : withFavourite(ids, book.id) }
        },
        rollbackOnError: true,
        revalidate: false,
      }
    ).then(() => mutateUser()).catch(() => {
      notify.error(isFavourite ? "Couldn't remove it from your favourites." : "Couldn't add it to your favourites.", { retry: toggleFavourite })
    })
  }
  return { isFavourite, toggleFavourite }
}

// The favourite control on a cover: the ribbon on a small ink tile in the top-left corner, the same contrast on
// every cover. A favourite always shows it; any other book shows it empty while you point at the cover (always on a
// phone, which has no hover), so it never jumps between corners or swaps for another button.
export const FavouriteChip: FC<{ book: Book; className?: string }> = ({ book, className }) => {
  const { isFavourite, toggleFavourite } = useToggleFavourite(book)
  return (
    <button
      type="button"
      aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={isFavourite}
      onClick={(e) => { e.stopPropagation(); toggleFavourite() }}
      className={cn(
        "grid size-8 place-items-center rounded-lg bg-[#141A22]/[.88] transition hover:bg-[#141A22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        !isFavourite && "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
        className
      )}
    >
      <svg aria-hidden width="12" height="15" viewBox="0 0 16 20">
        <path d="M1 1h14v17.2l-7-4.4-7 4.4z" strokeWidth="2" strokeLinejoin="round"
          className={isFavourite ? "fill-[#F13C3C] stroke-[#F13C3C]" : "fill-none stroke-white"} />
      </svg>
    </button>
  )
}

// "Add to favourites" as a choice in a form (finishing a book): it only says what you want, and the form applies it
// with the rest when you save (useToggleFavourite), so closing the form changes nothing.
export const FavouriteChoice: FC<{ value: boolean; onChange: (next: boolean) => void; disabled?: boolean; className?: string }> = ({ value, onChange, disabled, className }) => (
  <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} disabled={disabled}
    className={cn(
      "inline-flex h-11 w-fit items-center gap-2 rounded-full border px-4 text-sm font-medium transition disabled:opacity-60 sm:h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      value ? "border-[#F13C3C]/50 bg-[#F13C3C]/10 text-foreground" : "border-neutral-300 text-muted-foreground hover:bg-neutral-100 hover:text-foreground dark:border-neutral-700 dark:hover:bg-neutral-900",
      className
    )}>
    <Bookmark size={15} aria-hidden className={cn(value && "fill-[#F13C3C] text-[#F13C3C]")} />
    {value ? "In your favourites" : "Add to favourites"}
  </button>
)

const BookActions: FC<BookActionsProps> = ({ book, onUpdateProgress, tone = 'overlay', favourite = true, className }) => {
  const { mutate: booksMutate } = useBooks()
  const { mutate: mutateFav } = useFavourite()
  const { isFavourite, toggleFavourite } = useToggleFavourite(book)
  const bookEditModal = useBookEditModal()
  const bookNotesModal = useBookNotesModal()
  const recommendModal = useRecommendModal()
  const buttonClass = cn("h-8 w-8 rounded-full flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2", tones[tone])

  const removeBook = () => removeBookWithUndo(book, booksMutate, mutateFav)

  return (
    // Menu items render in a portal but still bubble through React, so stop clicks reaching the card.
    <div onClick={(e) => e.stopPropagation()} className={cn("flex gap-1.5", className)}>
      {favourite && (
        <button
          type="button"
          aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={isFavourite}
          onClick={toggleFavourite}
          className={buttonClass}
        >
          <Bookmark size={16} className={cn(isFavourite && "fill-current", isFavourite && tone === 'plain' && "text-[#F13C3C]")} />
        </button>
      )}
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
