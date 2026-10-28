"use client"
import { FC, KeyboardEvent, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Plus, X } from 'lucide-react'
import type { Book } from '@prisma/client'
import { notify, apiError } from '@/lib/notify'
import useBooks from '@/app/hooks/useBooks'
import { TAGS_PER_BOOK, TAG_MAX_LENGTH, cleanTag, cleanTags } from '@/lib/shelfTags'

interface ShelfTagsEditorProps {
  bookId: string
  tags: string[]
}

// The reader's own tags on one book ("owned", "kindle", "comfort-reads"), saved as they're added or removed.
// Only the reader sees them. Suggestions are the tags already on their shelf, so spellings stay consistent.
const ShelfTagsEditor: FC<ShelfTagsEditorProps> = ({ bookId, tags: initial }) => {
  const { books, mutate } = useBooks()
  const [tags, setTags] = useState<string[]>(initial)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  // Keyed on the tags' text, not the array: the parent passes a fresh [] for an untagged book on every render.
  const initialKey = initial.join("|")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTags(initial) }, [bookId, initialKey])

  const known = useMemo(() => {
    const all = new Map<string, string>()
    for (const b of (books ?? []) as Book[]) for (const t of b.tags ?? []) all.set(t.toLowerCase(), t)
    return Array.from(all.values()).sort((a, b) => a.localeCompare(b, 'en-GB'))
  }, [books])

  const save = (next: string[]) => {
    const previous = tags
    setTags(next)
    setSaving(true)
    axios.put(`/api/books/${bookId}/tags`, { tags: next }).then(({ data }) => {
      setTags(data.tags)
      mutate((list?: Book[]) => list?.map((b) => (b.id === bookId ? { ...b, tags: data.tags } : b)), { revalidate: false })
    }).catch((err) => {
      setTags(previous)
      notify.error(apiError(err, "Couldn't save your tags. Try again."))
    }).finally(() => setSaving(false))
  }

  const add = () => {
    // Typing "kindle, owned" adds both.
    const adding = draft.split(",").map(cleanTag).filter(Boolean)
    setDraft("")
    if (!adding.length) return
    // Match an existing tag's spelling, so "Owned" and "owned" don't become two tags.
    const spelled = adding.map((t) => known.find((k) => k.toLowerCase() === t.toLowerCase()) ?? t)
    const next = cleanTags([...tags, ...spelled])
    if (next.length !== tags.length) save(next)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      add()
    } else if (e.key === "Backspace" && !draft && tags.length) {
      save(tags.slice(0, -1))
    }
  }

  const listId = `shelf-tags-${bookId}`
  return (
    <section aria-labelledby={`${listId}-label`} className="flex flex-col gap-2">
      <h3 id={`${listId}-label`} className="text-sm font-medium">
        Your tags <span className="font-normal text-muted-foreground">· only you see these</span>
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-full bg-neutral-200 dark:bg-neutral-700/60 pl-3 pr-1 text-sm">
            {tag}
            <button type="button" onClick={() => save(tags.filter((t) => t !== tag))} disabled={saving} aria-label={`Remove tag ${tag}`}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-neutral-300 dark:hover:bg-neutral-600 hover:text-foreground">
              <X size={13} aria-hidden />
            </button>
          </span>
        ))}
        {tags.length < TAGS_PER_BOOK && (
          <span className="inline-flex items-center gap-1">
            <label htmlFor={`${listId}-input`} className="sr-only">Add a tag</label>
            <input id={`${listId}-input`} list={`${listId}-known`} value={draft} maxLength={TAG_MAX_LENGTH} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey} onBlur={() => draft.trim() && add()} placeholder={tags.length ? "Add a tag" : "owned, kindle, book club…"}
              className="h-7 w-40 rounded-full border border-dashed border-neutral-300 dark:border-neutral-700 bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            {draft.trim() && (
              <button type="button" onClick={add} aria-label="Add tag" className="rounded-full p-1 text-muted-foreground hover:text-foreground"><Plus size={14} aria-hidden /></button>
            )}
            <datalist id={`${listId}-known`}>
              {known.filter((k) => !tags.some((t) => t.toLowerCase() === k.toLowerCase())).map((k) => <option key={k} value={k} />)}
            </datalist>
          </span>
        )}
      </div>
    </section>
  )
}

export default ShelfTagsEditor
