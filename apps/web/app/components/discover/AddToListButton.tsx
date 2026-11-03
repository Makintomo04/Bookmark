"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { Check, ListPlus, Lock, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sameBook } from '@/lib/workKey'
import type { DiscoverBook } from '@/lib/openLibrary'
import useUser from '@/app/hooks/useUser'
import { preferencesOf } from '@/lib/preferences'
import { isListsKey, useMyLists } from '@/app/hooks/useLists'
import useListEditorModal, { emptyList } from '@/app/hooks/useListEditorModal'
import { can } from '@/lib/roles'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

// The reader's lists to add the book to, and a new list with it: the inside of a menu, so the book page's
// "…" menu can show the same thing as a submenu. `active` while it's open: the lists are only fetched then,
// not for every card on the page.
export const AddToListItems: FC<{ book: DiscoverBook, active: boolean, label?: boolean, itemClassName?: string }> = ({ book, active, label = true, itemClassName }) => {
  const { user } = useUser()
  const { lists, isLoading } = useMyLists(!!user?.id && active)
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { onOpen } = useListEditorModal()
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const add = (listId: string, title: string) => {
    setAddingTo(listId)
    axios.post(`/api/lists/${listId}/items`, book)
      .then(() => {
        notify.success(`Added to ${title}`, { action: { label: "View list", onClick: () => router.push(`/lists/${listId}`) } })
        mutate(isListsKey)
      })
      .catch((err) => notify.error(apiError(err, "Couldn't add to that list. Try again."), { retry: () => add(listId, title) }))
      .finally(() => setAddingTo(null))
  }

  const newListWithBook = () =>
    onOpen({ ...emptyList(can(user, "lists.curate"), user ? preferencesOf(user).defaultListVisibility : undefined), items: [{ workKey: book.workKey, title: book.title, author: book.author, coverUrl: book.coverUrl, pages: book.pages, note: "" }] })

  return (
    <>
      {label && <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Add to list</DropdownMenuLabel>}
      {isLoading ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading your lists…</p>
      ) : lists.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">You don&apos;t have any lists yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {lists.map((list) => {
            const onList = list.items.some((item) => sameBook(item, book))
            return (
              <DropdownMenuItem key={list.id} disabled={onList || addingTo !== null} onSelect={() => add(list.id, list.title)} className={cn("gap-2 cursor-pointer", itemClassName)}>
                <span className="min-w-0 flex-1 truncate">{list.title}</span>
                {list.visibility === "PRIVATE" && <Lock size={12} className="shrink-0 text-muted-foreground" aria-label="Private" />}
                {onList && <Check size={14} className="shrink-0" aria-label="Already on this list" />}
              </DropdownMenuItem>
            )
          })}
        </div>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={newListWithBook} className={cn("gap-2 cursor-pointer", itemClassName)}>
        <Plus size={14} aria-hidden />New list with this book
      </DropdownMenuItem>
    </>
  )
}

const AddToListButton: FC<{ book: DiscoverBook, className?: string }> = ({ book, className }) => {
  const { user } = useUser()
  const [open, setOpen] = useState(false)

  if (!user?.id) return null

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Add ${book.title} to a list`}
        className={cn("grid size-8 shrink-0 place-items-center rounded-full border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
      >
        <ListPlus size={15} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <AddToListItems book={book} active={open} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default AddToListButton
