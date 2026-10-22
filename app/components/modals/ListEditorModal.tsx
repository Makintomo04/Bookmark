"use client"
import { FC, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { ArrowDown, ArrowUp, MessageSquareQuote, Plus, Search, X } from 'lucide-react'
import type { Book } from '@prisma/client'
import Modal from './Modal'
import BookSearchResults, { BookSearchResult } from './BookSearchResults'
import BookCover from '../cards/BookCover'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { readableInk, toHex } from '@/lib/colour'
import { GENRES } from '@/lib/genres'
import { sameBook } from '@/lib/workKey'
import { LIST_DESCRIPTION_MAX as DESCRIPTION_MAX, LIST_ITEMS_MAX as ITEMS_MAX, LIST_NOTE_MAX as NOTE_MAX, LIST_TITLE_MAX as TITLE_MAX } from '@/lib/listRules'
import useUser from '@/app/hooks/useUser'
import useBooks from '@/app/hooks/useBooks'
import useBookSearch from '@/app/hooks/useBookSearch'
import useListEditorModal, { EditableList, EditableListItem } from '@/app/hooks/useListEditorModal'
import { isListsKey } from '@/app/hooks/useLists'

const fieldClass = "w-full rounded-md border border-neutral-300 dark:border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
const chipClass = "h-8 px-3 rounded-full text-xs font-medium border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
const iconButtonClass = "grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const Switch: FC<{ checked: boolean, onChange: (v: boolean) => void, label: string, hint?: string, accent: string, disabled?: boolean }> = ({ checked, onChange, label, hint, accent, disabled }) => (
  <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} disabled={disabled} className="flex items-start gap-3 text-left w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
    <span className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", !checked && "bg-neutral-300 dark:bg-neutral-700")} style={checked ? { background: accent } : undefined}>
      <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
    </span>
    <span>
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </span>
  </button>
)

const ListEditorModal: FC = () => {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { user } = useUser()
  const { books } = useBooks()
  const { isOpen, list: initial, onClose } = useListEditorModal()
  const isStaff = !!user?.isStaff
  const accent = user?.favColour || '#D92D2D'

  const [draft, setDraft] = useState<EditableList | null>(null)
  const [source, setSource] = useState<"search" | "shelf">("search")
  const [query, setQuery] = useState("")
  const [searchAttempt, setSearchAttempt] = useState(0)
  const { results, isSearching, searchFailed } = useBookSearch(query, { enabled: source === "search", attempt: searchAttempt })
  const [tagInput, setTagInput] = useState("")
  const [openNote, setOpenNote] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Why the last pick didn't go on the list, shown under the search box until the next search or add.
  const [addNotice, setAddNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !initial) return
    setDraft(initial)
    setQuery("")
    setTagInput("")
    setOpenNote(null)
    setConfirmDelete(false)
  }, [isOpen, initial])

  const shelfMatches = useMemo(() => {
    const all = Array.isArray(books) ? (books as Book[]) : []
    const q = query.trim().toLowerCase()
    return all
      .filter((b) => !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
      .slice(0, 8)
      .map((b): BookSearchResult => ({ workKey: b.workKey ?? null, title: b.title, author: b.author, pages: b.pages || null, coverUrl: b.coverImage || null }))
  }, [books, query])

  if (!draft) return null

  const isNew = !draft.id
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const update = (patch: Partial<EditableList>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const setItems = (items: EditableListItem[]) => update({ items })
  const withReasons = draft.items.filter((item) => item.note.trim()).length

  const addBook = (book: BookSearchResult) => {
    if (draft.items.some((item) => sameBook(item, book))) {
      setAddNotice(`"${book.title}" is already on this list.`)
      return
    }
    if (draft.items.length >= ITEMS_MAX) {
      setAddNotice(`Lists can hold up to ${ITEMS_MAX} books.`)
      return
    }
    setAddNotice(null)
    setItems([...draft.items, { workKey: book.workKey, title: book.title, author: book.author, coverUrl: book.coverUrl, pages: book.pages, note: "" }])
  }

  const move = (from: number, to: number) => {
    const items = [...draft.items]
    const [item] = items.splice(from, 1)
    items.splice(to, 0, item)
    setItems(items)
    if (openNote === from) setOpenNote(to)
  }

  const addTag = () => {
    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean)
    if (tags.length) update({ tags: Array.from(new Set([...draft.tags, ...tags])).slice(0, 10) })
    setTagInput("")
  }

  const close = () => {
    if (isSaving) return
    onClose()
  }

  const save = () => {
    // The Save button is disabled without a title, so this only guards a keyboard submit.
    if (!draft.title.trim()) return
    setIsSaving(true)
    const request = isNew ? axios.post("/api/lists", draft) : axios.patch(`/api/lists/${draft.id}`, draft)
    request.then((res) => {
      onClose()
      mutate(isListsKey)
      if (isNew) router.push(`/lists/${res.data.id}`)
      else router.refresh()
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't save this list. Try again."), { retry: save })
    }).finally(() => setIsSaving(false))
  }

  const remove = () => {
    setIsSaving(true)
    axios.delete(`/api/lists/${draft.id}`).then(() => {
      notify.success("List deleted")
      onClose()
      mutate(isListsKey)
      router.push(isStaff || !user?.username ? "/discover" : `/u/${user.username}`)
      router.refresh()
    }).catch(() => {
      notify.error("Couldn't delete this list. Try again.", { retry: remove })
    }).finally(() => setIsSaving(false))
  }

  const details = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="list-title" className="text-sm font-medium">Title</label>
        <input id="list-title" value={draft.title} maxLength={TITLE_MAX} onChange={(e) => update({ title: e.target.value })} placeholder="e.g. Cosy fantasy for winter nights" disabled={isSaving} autoComplete="off" className={cn(fieldClass, "h-10")} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="list-description" className="text-sm font-medium">Description <span className="font-normal text-muted-foreground">· optional</span></label>
          <span className="text-xs tabular-nums text-muted-foreground">{draft.description.length}/{DESCRIPTION_MAX}</span>
        </div>
        <textarea id="list-description" rows={3} value={draft.description} maxLength={DESCRIPTION_MAX} onChange={(e) => update({ description: e.target.value })} placeholder="What ties these books together?" disabled={isSaving} className={cn(fieldClass, "py-2 resize-y")} />
      </div>
    </div>
  )

  const bookPicker = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Books <span className="font-normal text-muted-foreground tabular-nums">· {draft.items.length}</span></h3>
        <div role="tablist" aria-label="Add books from" className="inline-flex rounded-full bg-neutral-100 dark:bg-neutral-900 p-0.5">
          {([["search", "Search"], ["shelf", "Your shelf"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={source === value} onClick={() => setSource(value)} className={cn("h-7 px-3 rounded-full text-xs font-medium transition", source === value ? "bg-background dark:bg-neutral-700 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden />
        <input value={query} onChange={(e) => { setQuery(e.target.value); setAddNotice(null) }} placeholder={source === "search" ? "Search by title or author to add" : "Filter your books"} aria-label="Find a book to add" autoComplete="off" disabled={isSaving} className={cn(fieldClass, "h-10 pl-9")} />
      </div>
      {addNotice && <p role="status" className="px-1 text-sm text-amber-700 dark:text-amber-400">{addNotice}</p>}
      {source === "search"
        ? query.trim().length >= 3 && <BookSearchResults results={results} isLoading={isSearching} onSelect={addBook} failed={searchFailed} onRetry={() => setSearchAttempt((n) => n + 1)} />
        : shelfMatches.length === 0
          ? <p className="px-1 text-sm text-muted-foreground">{query ? "None of your books match." : "Your shelf is empty."}</p>
          : <BookSearchResults results={shelfMatches} isLoading={false} onSelect={addBook} />}

      {draft.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-muted-foreground">Books you add appear here, in order.</p>
      ) : (
        <>
        {/* A nudge, never a requirement: reasons are what make a list a recommendation. */}
        {withReasons < draft.items.length && (
          <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed" style={{ background: `${toHex(accent) ?? "#D92D2D"}14` }}>
            <MessageSquareQuote size={14} aria-hidden className="mt-0.5 shrink-0" style={{ color: accent }} />
            <span>
              <span className="font-medium">{withReasons === 0 ? "Say why each book is here." : `${withReasons} of ${draft.items.length} books have a reason.`}</span>
              {" "}Your note shows next to the book with your name, as why someone would like it. It&apos;s what turns a list into a recommendation.
            </span>
          </p>
        )}
        <ol className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-800">
          {draft.items.map((item, i) => (
            <li key={`${item.workKey ?? item.title}-${i}`} className="p-3">
              <div className="flex items-center gap-3">
                <span className="w-5 text-right text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <BookCover book={{ title: item.title, author: item.author, coverImage: item.coverUrl || "", cardColour: null }} sizes="36px" variant="thumb" className="w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.author}</p>
                  {openNote !== i && (
                    item.note ? (
                      <button type="button" onClick={() => setOpenNote(i)} className="mt-0.5 max-w-full truncate text-left text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground">
                        “{item.note}”{item.noteBy && <span className="not-italic"> · from @{item.noteBy}</span>}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setOpenNote(i)} className="mt-0.5 inline-flex max-w-full items-center gap-1 text-left text-xs font-medium underline-offset-4 hover:underline">
                        <Plus size={12} aria-hidden className="shrink-0" style={{ color: accent }} />Why would someone like it?
                      </button>
                    )
                  )}
                </div>
                <div className="flex shrink-0">
                  <button type="button" aria-label={`Move ${item.title} up`} onClick={() => move(i, i - 1)} disabled={i === 0 || isSaving} className={iconButtonClass}><ArrowUp size={15} aria-hidden /></button>
                  <button type="button" aria-label={`Move ${item.title} down`} onClick={() => move(i, i + 1)} disabled={i === draft.items.length - 1 || isSaving} className={iconButtonClass}><ArrowDown size={15} aria-hidden /></button>
                  <button type="button" aria-label={`Remove ${item.title}`} onClick={() => { setItems(draft.items.filter((_, j) => j !== i)); setOpenNote(null) }} disabled={isSaving} className={iconButtonClass}><X size={15} aria-hidden /></button>
                </div>
              </div>
              {openNote === i && (
                <div className="mt-2 pl-8">
                  <textarea
                    autoFocus
                    rows={2}
                    value={item.note}
                    maxLength={NOTE_MAX}
                    aria-label={`Why someone would like ${item.title}`}
                    placeholder="What makes it worth reading? A line in your own words is plenty."
                    // Rewriting a note carried over from a remix makes it the reader's own.
                    onChange={(e) => setItems(draft.items.map((it, j) => (j === i ? { ...it, note: e.target.value, noteBy: null } : it)))}
                    onBlur={() => setOpenNote(null)}
                    className={cn(fieldClass, "py-2 resize-y")}
                  />
                  <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                    <span>{item.noteBy ? `Written by @${item.noteBy}. Edit it to make it yours.` : "Shown with your name as why someone would like it."}</span>
                    <span className="shrink-0 tabular-nums">{item.note.length}/{NOTE_MAX}</span>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
        </>
      )}
    </div>
  )

  const organise = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span id="list-genres" className="text-sm font-medium">Genres <span className="font-normal text-muted-foreground">· shows the list on these genre pages</span></span>
        <div role="group" aria-labelledby="list-genres" className="flex flex-wrap gap-1.5">
          {GENRES.map((genre) => {
            const on = draft.genres.includes(genre.slug)
            return (
              <button key={genre.slug} type="button" aria-pressed={on} disabled={isSaving}
                onClick={() => update({ genres: on ? draft.genres.filter((g) => g !== genre.slug) : [...draft.genres, genre.slug] })}
                className={cn(chipClass, on ? "border-transparent" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900")}
                style={on ? { background: genre.colour, color: readableInk(genre.colour) } : undefined}
              >
                {genre.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="list-tags" className="text-sm font-medium">Themes <span className="font-normal text-muted-foreground">· optional, e.g. female lead, debut authors</span></label>
        {draft.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {draft.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 h-7 pl-3 pr-1 rounded-full bg-neutral-100 dark:bg-neutral-900 text-xs font-medium">
                {tag}
                <button type="button" aria-label={`Remove ${tag}`} onClick={() => update({ tags: draft.tags.filter((t) => t !== tag) })} className="grid size-5 place-items-center rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800"><X size={12} aria-hidden /></button>
              </span>
            ))}
          </div>
        )}
        <input id="list-tags" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onBlur={addTag}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag() } }}
          placeholder="Type a theme and press Enter" disabled={isSaving || draft.tags.length >= 10} autoComplete="off" className={cn(fieldClass, "h-10")} />
      </div>
      <div className="flex flex-col gap-2">
        <span id="list-visibility" className="text-sm font-medium">Who can see it</span>
        <div role="radiogroup" aria-labelledby="list-visibility" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 p-1 sm:max-w-sm">
          {([["PUBLIC", "Everyone"], ["PRIVATE", "Only me"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={draft.visibility === value} onClick={() => update({ visibility: value })} disabled={isSaving}
              className={cn("h-9 rounded-md text-sm font-medium transition", draft.visibility === value ? "bg-background dark:bg-neutral-700 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {draft.visibility === "PUBLIC"
            ? "Shown on your profile, and on Discover and genre pages once it has books."
            : "Only you can see it. Switch to Everyone when it's ready to share."}
        </p>
      </div>
    </div>
  )

  const staffControls = isStaff && (
    <div className="flex flex-col gap-5 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bookmark team</p>
      <Switch checked={draft.isPick} onChange={(v) => update({ isPick: v })} label="Bookmark Pick" hint="Badged as a Pick and shown in the Picks row on Discover." accent={accent} disabled={isSaving} />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Spotlight <span className="font-normal text-muted-foreground">· featured at the top of Discover between these dates</span></span>
        <input value={draft.featuredLabel} maxLength={60} onChange={(e) => update({ featuredLabel: e.target.value })} placeholder="Label, e.g. Black History Month" aria-label="Spotlight label" disabled={isSaving} className={cn(fieldClass, "h-10")} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">From
            <input type="date" value={draft.featuredFrom} onChange={(e) => update({ featuredFrom: e.target.value })} disabled={isSaving} className={cn(fieldClass, "h-10 text-foreground")} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Until
            <input type="date" value={draft.featuredUntil} min={draft.featuredFrom || undefined} onChange={(e) => update({ featuredUntil: e.target.value })} disabled={isSaving} className={cn(fieldClass, "h-10 text-foreground")} />
          </label>
        </div>
      </div>
      {!isNew && <Switch checked={draft.hidden} onChange={(v) => update({ hidden: v })} label="Hidden" hint="Takes the list down for everyone except its owner and staff." accent={accent} disabled={isSaving} />}
    </div>
  )

  const body = (
    <div className="w-full px-6 self-start flex flex-col gap-8 pb-2">
      {details}
      {bookPicker}
      {organise}
      {staffControls}
    </div>
  )

  const footer = (
    <div className="w-full p-6 flex flex-wrap items-center justify-end gap-3">
      {!isNew && (confirmDelete ? (
        <div className="mr-auto flex items-center gap-2">
          <Button type="button" onClick={remove} disabled={isSaving} className="bg-rose-700 hover:bg-rose-800 text-white">Delete list</Button>
          <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={isSaving}>Keep it</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)} disabled={isSaving} className="mr-auto text-rose-600 dark:text-rose-400 hover:text-rose-600">Delete</Button>
      ))}
      <Button type="button" variant="outline" onClick={close} disabled={isSaving} className="hidden sm:inline-flex">{isDirty ? "Cancel" : "Close"}</Button>
      <Button type="button" onClick={save} disabled={isSaving || !isDirty || !draft.title.trim()} style={{ background: accent, color: readableInk(accent) }}>
        {isSaving ? "Saving…" : isNew ? "Create list" : "Save changes"}
      </Button>
    </div>
  )

  return (
    <Modal
      title={isNew ? (draft.isPick ? "New Bookmark Pick" : "New list") : "Edit list"}
      body={body}
      footer={footer}
      onClose={close}
      isOpen={isOpen}
      disabled={isSaving}
      closeOnBackdrop={!isDirty}
      compact
    />
  )
}

export default ListEditorModal
