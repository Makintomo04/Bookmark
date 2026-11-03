"use client"
import { FC, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Crown, ListPlus, Loader2, MoreHorizontal, Send, Users } from 'lucide-react'
import type { DiscoverBook } from '@/lib/openLibrary'
import { cn } from '@/lib/utils'
import useUser from '@/app/hooks/useUser'
import { useStartCircle } from '../buddy-reads/StartCircleButton'
import { useSendToFriend } from './SendToFriendButton'
import { AddToListItems } from '../discover/AddToListButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const item = "h-11 gap-3 px-3 rounded-md text-sm font-medium cursor-pointer"

// The book page's "…" beside the shelf button: the things you might do with a book besides shelving it,
// each doing just what its own button did (StartCircleButton, SendToFriendButton, AddToListButton).
// Signed out only Start a reading circle shows, which asks to join, as before.
const BookMoreMenu: FC<{ book: DiscoverBook, bookKey: string, className?: string }> = ({ book, bookKey, className }) => {
  const { user } = useUser()
  const circle = useStartCircle(book)
  const send = useSendToFriend(book, bookKey)
  const [listsOpen, setListsOpen] = useState(false)
  // On a phone there's no room beside the menu for a submenu, so Add to a list swaps the menu for the lists
  // instead, with a way back. From sm up it's an ordinary submenu.
  const [narrow, setNarrow] = useState(false)
  const [showLists, setShowLists] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    setNarrow(query.matches)
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  const CircleIcon = circle.isWorking ? Loader2 : circle.upgrade ? Crown : Users

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setShowLists(false) }}>
      <DropdownMenuTrigger
        aria-label={`More for ${book.title}`}
        className={cn("grid size-11 shrink-0 place-items-center rounded-full border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 data-[state=open]:bg-neutral-100 dark:data-[state=open]:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", className)}
      >
        <MoreHorizontal size={18} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
        {showLists ? <>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowLists(false) }} className={item}>
            <ChevronLeft size={16} aria-hidden className="shrink-0" />Add to a list
          </DropdownMenuItem>
          <AddToListItems book={book} active label={false} itemClassName="h-11 px-3" />
        </> : <>
        <DropdownMenuItem
          onSelect={circle.start}
          disabled={circle.isWorking}
          aria-label={circle.upgrade ? `Start a reading circle for ${book.title}: more circles need Plus` : undefined}
          className={item}
        >
          <CircleIcon size={16} aria-hidden className={cn("shrink-0", circle.isWorking && "animate-spin", circle.upgrade && !circle.isWorking && "text-brand-text")} />
          Start a reading circle
        </DropdownMenuItem>
        {send && (
          <DropdownMenuItem onSelect={send} className={item}>
            <Send size={16} aria-hidden className="shrink-0" />Send to a friend
          </DropdownMenuItem>
        )}
        {user?.id && narrow && (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowLists(true) }} className={item}>
            <ListPlus size={16} aria-hidden className="shrink-0" />Add to a list
            <ChevronRight size={16} aria-hidden className="ml-auto shrink-0" />
          </DropdownMenuItem>
        )}
        {user?.id && !narrow && (
          <DropdownMenuSub open={listsOpen} onOpenChange={setListsOpen}>
            <DropdownMenuSubTrigger className={item}>
              <ListPlus size={16} aria-hidden className="shrink-0" />Add to a list
            </DropdownMenuSubTrigger>
            {/* Portalled, so the parent menu's overflow and transform don't clip it. */}
            <DropdownMenuPortal>
              <DropdownMenuSubContent collisionPadding={16} className="w-60 rounded-xl p-1.5">
                <AddToListItems book={book} active={listsOpen} label={false} itemClassName="h-11 px-3" />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        )}
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default BookMoreMenu
