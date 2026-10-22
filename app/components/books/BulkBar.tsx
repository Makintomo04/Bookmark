"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import type { Book } from '@prisma/client'
import { mutate as mutateGlobal } from 'swr'
import { notify } from '@/lib/notify'
import useBooks from '@/app/hooks/useBooks'
import useFavourite from '@/app/hooks/useFavourite'
import { isListsKey, useMyLists } from '@/app/hooks/useLists'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const plural = (n: number) => `${n} ${n === 1 ? "book" : "books"}`

// Sent with keepalive so a removal whose undo toast is still up survives the tab closing.
const bulk = (body: Record<string, unknown>) => fetch("/api/books/bulk", {
  method: "POST", keepalive: true, credentials: "same-origin",
  headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then(async (res) => {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Something went wrong")
  return data
})

// The action bar for the shelf's select mode. Only moves with no read history are offered here
// (Will not read and back); starting or finishing a book stays one book at a time.
const BulkBar: FC<{ selected: Book[], onDone: () => void, onCancel: () => void }> = ({ selected, onDone, onCancel }) => {
  const { mutate: mutateBooks } = useBooks()
  const { mutate: mutateFav } = useFavourite()
  const [listsOpen, setListsOpen] = useState(false)
  const { lists } = useMyLists(listsOpen)
  const [busy, setBusy] = useState(false)
  const ids = selected.map((b) => b.id)
  const wanted = selected.filter((b) => b.status === "NOT_STARTED").length
  const declined = selected.filter((b) => b.status === "NOT_INTERESTED").length

  const run = (body: Record<string, unknown>, done: (data: any) => string) => {
    setBusy(true)
    bulk({ ...body, ids }).then((data) => {
      notify.success(done(data))
      refreshAfterBookChange()
      onDone()
    }).catch((err) => notify.error(err.message)).finally(() => setBusy(false))
  }

  const addToList = (listId: string) => run({ action: "addToList", listId }, (d) => {
    mutateGlobal(isListsKey)
    const extra = d.overLimit > 0 ? `; ${plural(d.overLimit)} didn't fit` : d.alreadyOnList > 0 ? `; ${plural(d.alreadyOnList)} already there` : ""
    return `Added ${plural(d.added)} to the list${extra}`
  })

  // Same pattern as removing one book: gone at once, deleted when the undo toast closes.
  const remove = () => {
    const gone = new Set(ids)
    mutateBooks((books?: Book[]) => books?.filter((b) => !gone.has(b.id)), { revalidate: false })
    onDone()
    const commit = () => {
      bulk({ action: "remove", ids })
        .then(() => { refreshAfterBookChange(); mutateFav() })
        .catch(() => { mutateBooks(); notify.error(`Couldn't remove ${plural(ids.length)}.`, { retry: commit }) })
    }
    notify.undo(`Removed ${plural(ids.length)}`, { onUndo: () => { mutateBooks() }, commit })
  }

  return (
    <div role="toolbar" aria-label="Selected books"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-3xl flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 shadow-lg">
      <p className="text-sm font-medium mr-auto tabular-nums" aria-live="polite">{selected.length === 0 ? "Select books" : `${plural(selected.length)} selected`}</p>
      {wanted > 0 && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "notInterested" }, (d) => `Moved ${plural(d.updated)} to Will not read`)}>
          Will not read
        </Button>
      )}
      {declined > 0 && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "wantToRead" }, (d) => `Moved ${plural(d.updated)} to Want to read`)}>
          Want to read
        </Button>
      )}
      <DropdownMenu onOpenChange={setListsOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy || selected.length === 0}>Add to list</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Your lists</DropdownMenuLabel>
          {lists.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No lists yet.</p>}
          {lists.map((l) => <DropdownMenuItem key={l.id} onSelect={() => addToList(l.id)}>{l.title}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="outline" disabled={busy || selected.length === 0} onClick={remove} className="text-red-500 hover:text-red-500">Remove</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Done</Button>
    </div>
  )
}

export default BulkBar
