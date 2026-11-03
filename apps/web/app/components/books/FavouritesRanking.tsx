"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import Link from 'next/link'
import type { Book } from '@prisma/client'
import { MoreHorizontal } from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable } from '@dnd-kit/sortable'
import { apiError, notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { TOP_FAVOURITES, rankedFavouriteIds, storedFavouriteIds } from '@/lib/favourites'
import useBooks from '@/app/hooks/useBooks'
import useFavourite from '@/app/hooks/useFavourite'
import useUser from '@/app/hooks/useUser'
import useBookUpdateModal from '@/app/hooks/useBookUpdateModal'
import { Status } from '@/lib/bookStatus'
import BookCover from '../cards/BookCover'
import Loader from '../Loader'
import FetchErrorState from '../FetchErrorState'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import FavouriteRankBadge from './FavouriteRankBadge'
import { coverGridClass } from './shelf'

interface TileProps {
  book: Book
  // 0-based place in the ranking.
  index: number
  total: number
  onMove: (from: number, to: number) => void
}

// One favourite. The cover is the drag handle (and still opens the book on a click); the menu does the same moves
// without dragging, for keyboards and screen readers.
const Tile: FC<TileProps> = ({ book, index, total, onMove }) => {
  const { attributes, listeners, setNodeRef, isDragging, isOver } = useSortable({ id: book.id })
  const bookUpdateModal = useBookUpdateModal()
  const top = index < TOP_FAVOURITES
  const open = () => {
    bookUpdateModal.setBookIdState(book.id)
    bookUpdateModal.setBook(book, book.status === Status.COMPLETED)
    bookUpdateModal.onOpen(book.id)
  }
  return (
    <li ref={setNodeRef} className={cn("relative flex min-w-0 flex-col gap-1.5", isDragging && "opacity-30")}>
      <div className="relative">
        {top && <FavouriteRankBadge rank={index + 1} />}
        <button type="button" onClick={open} aria-label={`${book.title} by ${book.author}`} {...attributes} {...listeners}
          // touch-action keeps a vertical swipe scrolling the page; a press-and-hold picks the book up.
          style={{ touchAction: 'manipulation' }}
          className={cn("block w-full cursor-grab rounded-md transition active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", isOver && !isDragging && "ring-2 ring-ring ring-offset-2 ring-offset-background")}>
          <BookCover book={book} variant="thumb" sizes="(min-width: 1024px) 240px, 40vw" className="w-full shadow-sm" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Move ${book.title}`}
              className="absolute bottom-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-background/90 text-foreground shadow ring-1 ring-black/10 transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:ring-white/15">
              <MoreHorizontal size={16} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {index > 0 && <DropdownMenuItem onSelect={() => onMove(index, 0)}>Make number 1</DropdownMenuItem>}
            {!top && <DropdownMenuItem onSelect={() => onMove(index, TOP_FAVOURITES - 1)}>Move into the top four</DropdownMenuItem>}
            {top && index > 0 && <DropdownMenuItem onSelect={() => onMove(index, index - 1)}>Move up one</DropdownMenuItem>}
            {top && index < TOP_FAVOURITES - 1 && index < total - 1 && <DropdownMenuItem onSelect={() => onMove(index, index + 1)}>Move down one</DropdownMenuItem>}
            {top && total > TOP_FAVOURITES && <DropdownMenuItem onSelect={() => onMove(index, TOP_FAVOURITES)}>Move out of the top four</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <span className="line-clamp-2 text-xs font-medium leading-snug">{book.title}</span>
    </li>
  )
}

// Your favourites as a ranking: the top four are numbered and are the ones your profile shows. Drag a book onto
// another to put it in that place, into the top four or out of it; everything saves as you drop it.
const FavouritesRanking: FC = () => {
  const { user, isLoading: isLoadingUser, isError: isErrorUser, mutate: mutateUser } = useUser()
  const { books, isLoading: isLoadingBooks, isError: isErrorBooks, mutate: mutateBooks } = useBooks()
  const { favourites, mutate: mutateFavourites } = useFavourite()
  const [dragging, setDragging] = useState<string | null>(null)
  // A mouse drags after moving a few pixels (so a click still opens the book); a finger after a short press (so a
  // swipe still scrolls).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )

  if (isErrorUser || isErrorBooks) return <FetchErrorState error={isErrorUser || isErrorBooks} what="your favourites" onRetry={() => { mutateUser(); mutateBooks() }} />
  if (isLoadingUser || isLoadingBooks || !user) return <Loader notScreen />

  const byId = new Map<string, Book>((books ?? []).map((b: Book) => [b.id, b]))
  const ranked = rankedFavouriteIds(favourites as string[])
  const order = ranked.filter((id) => byId.has(id))
  // Favourites whose book is no longer on the shelf stay in the saved list, last, so a reorder is of every id.
  const unseen = ranked.filter((id) => !byId.has(id))

  if (order.length === 0) return (
    <p className="text-lg">You have no books favourited, visit <Link href="/" className="text-brand-text transition hover:underline">Home</Link> to view your books or create an entry.</p>
  )

  const save = async (next: string[]) => {
    const full = [...next, ...unseen]
    mutateFavourites((data: any) => data && ({ ...data, favouriteIds: storedFavouriteIds(full) }), { revalidate: false })
    try {
      await axios.put('/api/favourites/order', { ids: full })
    } catch (err) {
      notify.error(apiError(err, "Couldn't save your ranking. Try again."))
    } finally {
      mutateFavourites()
      mutateUser()
    }
  }
  const move = (from: number, to: number) => { if (from !== to) save(arrayMove(order, from, to)) }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    if (!over || active.id === over.id) return
    move(order.indexOf(String(active.id)), order.indexOf(String(over.id)))
  }

  const tile = (id: string, i: number) => <Tile key={id} book={byId.get(id)!} index={i} total={order.length} onMove={move} />
  const topIds = order.slice(0, TOP_FAVOURITES)
  const restIds = order.slice(TOP_FAVOURITES)
  const dragged = dragging ? byId.get(dragging) : null

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={({ active }: DragStartEvent) => setDragging(String(active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      {/* No live shuffling: the book you're holding is lifted out, and the one you'd take the place of is ringed. */}
      <SortableContext items={order} strategy={() => null}>
        <p className="mb-8 max-w-xl text-sm text-muted-foreground">
          Your top four are the ones your profile shows. Drag a book onto another to put it in that place, into the top four or out of it, or use the menu on its cover.
        </p>
        <section aria-labelledby="top-four">
          <h2 id="top-four" className="mb-4 flex items-baseline gap-2 text-lg font-semibold">
            Top four<span className="text-sm font-normal text-muted-foreground">on your profile</span>
          </h2>
          <ol className="grid max-w-3xl grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">{topIds.map((id, i) => tile(id, i))}</ol>
        </section>
        {restIds.length > 0 && (
          <section aria-labelledby="more-favourites" className="mt-12">
            <h2 id="more-favourites" className="mb-4 flex items-baseline gap-2 text-lg font-semibold">
              More favourites<span className="text-sm font-normal text-muted-foreground tabular-nums">{restIds.length}</span>
            </h2>
            <ol className={coverGridClass}>{restIds.map((id, i) => tile(id, TOP_FAVOURITES + i))}</ol>
          </section>
        )}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {dragged && <div className="w-32 rotate-2 opacity-95 shadow-2xl"><BookCover book={dragged} variant="thumb" sizes="128px" className="w-full" /></div>}
      </DragOverlay>
    </DndContext>
  )
}

export default FavouritesRanking
