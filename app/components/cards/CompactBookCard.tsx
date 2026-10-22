"use client"
import { FC } from 'react'
import { Status, type Book } from '@prisma/client';
import Image from 'next/image';
import BookCover from './BookCover';
import ShelfMenuItems from '../books/ShelfMenuItems';
import { Book as BookClosed, BookOpen, Check, CircleSlash, EyeOff, MoreVertical, Pause, Star } from 'lucide-react';
import useUser from '@/app/hooks/useUser';
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal';
import useBookEditModal from '@/app/hooks/useBookEditModal';
import useBookNotesModal from '@/app/hooks/useBookNotesModal';
import useRecommendModal from '@/app/hooks/useRecommendModal';
import { recommendedByOf } from '@/lib/recommendRules';
import useBooks from '@/app/hooks/useBooks';
import useFavourite from '@/app/hooks/useFavourite';
import { formatStoppedAt, progressScale, progressWhole } from '@/lib/progress';
import axios from 'axios';
import { notify } from '@/lib/notify';
import { removeBookWithUndo } from '../books/removeBookWithUndo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface CompactBookCardProps {
  book: Book
}

const CompactBookCard: FC<CompactBookCardProps> = ({ book }) => {
  const { title, author, status, rating } = book
  const scale = progressScale(book)
  const { user, mutate } = useUser()
  const { mutate: booksMutate } = useBooks()
  const { hasFavourited, mutate: mutateFav } = useFavourite()
  const bookUpdateModal = useBookUpdateModal()
  const bookEditModal = useBookEditModal()
  const bookNotesModal = useBookNotesModal()
  const recommendModal = useRecommendModal()

  const handleOpenBookModal = () => {
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, book.status === Status.COMPLETED ? true : false)
    bookUpdateModal.onOpen(book.id)
  }

  const handleFavClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const isFavourite = hasFavourited(book.id)
    axios.post(`/api/favourites/${book.id}`).catch(() => {
      notify.error(isFavourite ? "Couldn't remove it from your favourites." : "Couldn't add it to your favourites.")
    }).finally(() => {
      mutateFav()
      mutate()
    })
  }

  const handleRemove = () => removeBookWithUndo(book, booksMutate, mutateFav)

  return (
    <div onClick={handleOpenBookModal} className="cursor-pointer flex gap-3 items-center p-3 rounded-xl border border-neutral-700/50 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition relative">
      <BookCover book={book} fallbackColour={user?.favColour} variant="thumb" sizes="48px" className="w-10 flex-shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-sm">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{author}</p>
        <div className="flex items-center gap-2 mt-1">
          {status === Status.STARTED ? <BookOpen size={14} className="text-muted-foreground flex-shrink-0" />
            : status === Status.NOT_STARTED ? <BookClosed size={14} className="text-muted-foreground flex-shrink-0" />
            : status === Status.PAUSED ? <Pause size={14} aria-label="Paused" className="text-muted-foreground flex-shrink-0" />
            : status === Status.DNF ? <CircleSlash size={14} aria-label="Did not finish" className="text-muted-foreground flex-shrink-0" />
            : status === Status.NOT_INTERESTED ? <EyeOff size={14} aria-label="Will not read" className="text-muted-foreground flex-shrink-0" />
            : <Check size={14} className="text-muted-foreground flex-shrink-0" />}
          {rating ? (
            <div className="flex items-center gap-0.5">
              <Star size={12} fill="currentColor" aria-hidden />
              <p className="text-xs">{rating}</p>
            </div>
          ) : null}
          {status === Status.DNF && (
            <p className="text-xs text-muted-foreground tabular-nums">{formatStoppedAt(book)}</p>
          )}
          {status === Status.NOT_STARTED && recommendedByOf(book) && (
            <p className="text-xs text-muted-foreground truncate">Recommended by {recommendedByOf(book)}</p>
          )}
          {(status === Status.STARTED || status === Status.PAUSED) && (
            <progress className="h-[4px] rounded-full overflow-hidden flex-1 min-w-0" value={scale.current} max={scale.total || 1}>{progressWhole(book)}%</progress>
          )}
        </div>
      </div>
      <div onClick={(e) => { e.stopPropagation(); handleFavClick(e) }} className="h-4 w-4 flex-shrink-0 relative cursor-pointer">
        {hasFavourited(book.id) ? <Image src="/images/bookmark_active.svg" alt="" fill className="select-none" /> :
          <Image src="/images/bookmark_inactive.svg" alt="" fill className="select-none opacity-40" />}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div onClick={(e) => e.stopPropagation()} className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer">
            <MoreVertical size={16} />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); bookEditModal.onOpen(book) }}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); bookNotesModal.onOpen(book.id, book.title) }}>Notes</DropdownMenuItem>
          {book.status !== "NOT_INTERESTED" && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); recommendModal.onOpen(book.id, book.title) }}>Send to a friend</DropdownMenuItem>
          )}
          <ShelfMenuItems book={book} />
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRemove() }}>Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default CompactBookCard
