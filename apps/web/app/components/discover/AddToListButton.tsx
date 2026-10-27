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

const AddToListButton: FC<{ book: DiscoverBook, className?: string }> = ({ book, className }) => {
  const { user } = useUser()
  const signedIn = !!user?.id
  const [open, setOpen] = useState(false)
  // Only fetch the reader's lists once they open the menu, not for every card on the page.
  const { lists, isLoading } = useMyLists(signedIn && open)
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { onOpen } = useListEditorModal()
  const [addingTo, setAddingTo] = useState<string | null>(null)

  if (!signedIn) return null

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
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Add ${book.title} to a list`}
        className={cn("grid size-8 shrink-0 place-items-center rounded-full border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
      >
        <ListPlus size={15} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Add to list</DropdownMenuLabel>
        {isLoading ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading your lists…</p>
        ) : lists.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">You don&apos;t have any lists yet.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {lists.map((list) => {
              const onList = list.items.some((item) => sameBook(item, book))
              return (
                <DropdownMenuItem key={list.id} disabled={onList || addingTo !== null} onSelect={() => add(list.id, list.title)} className="gap-2 cursor-pointer">
                  <span className="min-w-0 flex-1 truncate">{list.title}</span>
                  {list.visibility === "PRIVATE" && <Lock size={12} className="shrink-0 text-muted-foreground" aria-label="Private" />}
                  {onList && <Check size={14} className="shrink-0" aria-label="Already on this list" />}
                </DropdownMenuItem>
              )
            })}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={newListWithBook} className="gap-2 cursor-pointer">
          <Plus size={14} aria-hidden />New list with this book
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default AddToListButton
