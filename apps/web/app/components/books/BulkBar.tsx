"use client"
import { FC, FormEvent, useMemo, useState } from 'react'
import type { Book } from '@prisma/client'
import { mutate as mutateGlobal } from 'swr'
import { notify } from '@/lib/notify'
import useBooks from '@/app/hooks/useBooks'
import useFavourite from '@/app/hooks/useFavourite'
import { isListsKey, useMyLists } from '@/app/hooks/useLists'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { BULK_MAX } from '@/lib/bulkRules'
import { TAG_MAX_LENGTH, cleanTag } from '@/lib/shelfTags'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const plural = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? "book" : "books"}`

// Sent with keepalive so a removal whose undo toast is still up survives the tab closing.
const post = (body: Record<string, unknown>) => fetch("/api/books/bulk", {
  method: "POST", keepalive: true, credentials: "same-origin",
  headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then(async (res) => {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Something went wrong")
  return data as Record<string, number>
})

// One action over any number of books: the API takes BULK_MAX at a time, so a bigger selection goes in
// batches, one after another (a list fills up in order), and the counts come back added together.
export async function bulk(body: Record<string, unknown>, ids: string[]) {
  const total: Record<string, number> = {}
  for (let i = 0; i < ids.length; i += BULK_MAX) {
    const data = await post({ ...body, ids: ids.slice(i, i + BULK_MAX) })
    for (const [key, value] of Object.entries(data)) if (typeof value === "number") total[key] = (total[key] ?? 0) + value
  }
  return total
}

// The action bar for the shelf's select mode. Only moves with no read history are offered here
// (Will not read and back); starting or finishing a book stays one book at a time.
const BulkBar: FC<{ selected: Book[], onDone: () => void, onCancel: () => void }> = ({ selected, onDone, onCancel }) => {
  const { books, mutate: mutateBooks } = useBooks()
  const { mutate: mutateFav } = useFavourite()
  const [listsOpen, setListsOpen] = useState(false)
  const { lists } = useMyLists(listsOpen)
  const [busy, setBusy] = useState(false)
  const [newTag, setNewTag] = useState("")
  const ids = selected.map((b) => b.id)
  const wanted = selected.filter((b) => b.status === "NOT_STARTED").length
  const declined = selected.filter((b) => b.status === "NOT_INTERESTED").length
  // Offer whichever way most of the selection would move; a mixed selection is made private.
  const allPrivate = selected.length > 0 && selected.every((b) => b.isPrivate)
  // Tags on the shelf to pick from, and the ones on the selection that can be taken off.
  const shelfTags = useMemo(() => {
    const all = new Map<string, string>()
    for (const b of (books ?? []) as Book[]) for (const t of b.tags ?? []) all.set(t.toLowerCase(), t)
    return Array.from(all.values()).sort((a, b) => a.localeCompare(b, 'en-GB'))
  }, [books])
  const selectedTags = useMemo(() => {
    const all = new Map<string, string>()
    for (const b of selected) for (const t of b.tags ?? []) all.set(t.toLowerCase(), t)
    return Array.from(all.values()).sort((a, b) => a.localeCompare(b, 'en-GB'))
  }, [selected])

  const run = (body: Record<string, unknown>, done: (data: Record<string, number>) => string) => {
    setBusy(true)
    bulk(body, ids).then((data) => {
      notify.success(done(data))
      refreshAfterBookChange()
      onDone()
    }).catch((err) => notify.error(err.message)).finally(() => setBusy(false))
  }

  const addToList = (listId: string) => run({ action: "addToList", listId }, (d) => {
    mutateGlobal(isListsKey)
    const extra = d.overLimit > 0 ? `; ${plural(d.overLimit)} didn't fit` : d.alreadyOnList > 0 ? `; ${plural(d.alreadyOnList)} already there` : ""
    return `Added ${plural(d.added ?? 0)} to the list${extra}`
  })

  const tag = (raw: string) => {
    const name = cleanTag(raw)
    if (!name) return
    setNewTag("")
    run({ action: "addTag", tag: name }, (d) => `Tagged ${plural(d.updated ?? 0)} "${name}"${d.full > 0 ? `; ${plural(d.full)} already had 30 tags` : ""}`)
  }
  const untag = (name: string) => run({ action: "removeTag", tag: name }, (d) => `Took "${name}" off ${plural(d.updated ?? 0)}`)
  const onNewTag = (e: FormEvent) => { e.preventDefault(); tag(newTag) }

  // Same pattern as removing one book: gone at once, deleted when the undo toast closes. However many
  // batches it takes, it's one removal and one undo.
  const remove = () => {
    const gone = new Set(ids)
    const removing = ids.slice()
    mutateBooks((books?: Book[]) => books?.filter((b) => !gone.has(b.id)), { revalidate: false })
    onDone()
    const commit = () => {
      bulk({ action: "remove" }, removing)
        .then(() => { refreshAfterBookChange(); mutateFav() })
        .catch(() => { mutateBooks(); notify.error(`Couldn't remove ${plural(removing.length)}.`, { retry: commit }) })
    }
    notify.undo(`Removed ${plural(removing.length)}`, { onUndo: () => { mutateBooks() }, commit })
  }

  return (
    <div role="toolbar" aria-label="Selected books"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-3xl flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 shadow-lg">
      <p className="text-sm font-medium mr-auto tabular-nums" aria-live="polite">{selected.length === 0 ? "Select books" : `${plural(selected.length)} selected`}</p>
      {wanted > 0 && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "notInterested" }, (d) => `Moved ${plural(d.updated ?? 0)} to Will not read`)}>
          Will not read
        </Button>
      )}
      {declined > 0 && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "wantToRead" }, (d) => `Moved ${plural(d.updated ?? 0)} to Want to read`)}>
          Want to read
        </Button>
      )}
      {allPrivate ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "makePublic" }, (d) => `Shared ${plural(d.updated ?? 0)} on your profile`)}>
          Share on profile
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled={busy || selected.length === 0} onClick={() => run({ action: "makePrivate" }, (d) => `Made ${plural(d.updated ?? 0)} private`)}>
          Make private
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy || selected.length === 0}>Tag</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 max-h-80 overflow-y-auto">
          <form onSubmit={onNewTag} className="p-1.5" onKeyDown={(e) => e.stopPropagation()}>
            <label htmlFor="bulk-new-tag" className="sr-only">New tag</label>
            <input id="bulk-new-tag" value={newTag} maxLength={TAG_MAX_LENGTH} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag, then Enter"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </form>
          {shelfTags.length > 0 && <DropdownMenuLabel>Add a tag</DropdownMenuLabel>}
          {shelfTags.map((t) => <DropdownMenuItem key={`add-${t}`} onSelect={() => tag(t)}>{t}</DropdownMenuItem>)}
          {selectedTags.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Take a tag off</DropdownMenuLabel>
              {selectedTags.map((t) => <DropdownMenuItem key={`remove-${t}`} onSelect={() => untag(t)}>Remove “{t}”</DropdownMenuItem>)}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
      <Button size="sm" variant="outline" disabled={busy || selected.length === 0} onClick={remove} className="text-danger hover:text-danger">Remove</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Done</Button>
    </div>
  )
}

export default BulkBar
