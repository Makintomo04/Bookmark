'use client'

import { FC, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Search, X } from 'lucide-react'

interface NoteRow {
  id: string
  title: string | null
  snippet: string
  matched: string[]
  createdAt: string
  book: { id: string; title: string; author: string; href: string | null }
}

interface NotesPage {
  notes: NoteRow[]
  total: number
  next: number | null
}

// How long typing pauses before the list filters.
const DEBOUNCE_MS = 300

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The words that matched, marked. Matching is by word start, as on the server (lib/noteSearch.ts).
const Highlighted: FC<{ text: string; terms: string[] }> = ({ text, terms }) => {
  if (terms.length === 0) return <>{text}</>
  const parts = text.split(new RegExp(`(\\b(?:${terms.map(escape).join('|')})\\w*)`, 'i'))
  return <>{parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className="rounded bg-brand/15 px-0.5 text-foreground">{part}</mark> : part))}</>
}

// Every note the reader has written, newest first, with a box that filters them by the words they
// remember. Plain word matching, no AI.
const NoteSearch: FC = () => {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<NotesPage | null>(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only the newest request may update the list, so a slow answer to an older filter can't land last.
  const latest = useRef(0)

  useEffect(() => {
    const q = query.trim()
    const id = ++latest.current
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data } = await axios.get<NotesPage>('/api/notes', { params: q.length >= 2 ? { q } : {} })
        if (id !== latest.current) return
        setPage(data)
        setFilter(q.length >= 2 ? q : '')
      } catch (err) {
        if (id !== latest.current) return
        setError(axios.isAxiosError(err) && err.response?.data?.error ? String(err.response.data.error) : "Your notes didn't load. Try again in a minute.")
      } finally {
        if (id === latest.current) setLoading(false)
      }
    }, page === null ? 0 : DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const showMore = async () => {
    if (!page || page.next === null || loadingMore) return
    const id = latest.current
    setLoadingMore(true)
    try {
      const { data } = await axios.get<NotesPage>('/api/notes', { params: { ...(filter && { q: filter }), offset: page.next } })
      if (id === latest.current) setPage({ ...data, notes: [...page.notes, ...data.notes] })
    } catch {
      setError("More notes didn't load. Try again in a minute.")
    } finally {
      setLoadingMore(false)
    }
  }

  const count = page?.total ?? 0

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div role="search" className="relative">
        <label htmlFor="note-search" className="sr-only">Filter your notes</label>
        <Search size={16} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          id="note-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
          placeholder="Filter by the words you remember"
          className="w-full rounded-full border border-neutral-300 bg-background py-2 pl-10 pr-10 text-sm dark:border-neutral-700 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear the filter" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground">
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {page && !error && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filter
            ? count === 0
              ? <>No notes with &ldquo;{filter}&rdquo;. Try fewer words, or the start of a word you remember.</>
              : <>{count} {count === 1 ? 'note' : 'notes'} with &ldquo;{filter}&rdquo;</>
            : count === 0
              ? 'No notes yet. Notes you add on a book’s page show up here.'
              : `${count} ${count === 1 ? 'note' : 'notes'}, newest first`}
        </p>
      )}

      {page && page.notes.length > 0 && (
        <ul className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {page.notes.map((n) => (
            <li key={n.id} className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
              {n.title && <p className="mb-1 text-sm font-semibold">{n.title}</p>}
              <p className="whitespace-pre-wrap text-sm leading-relaxed"><Highlighted text={n.snippet} terms={n.matched} /></p>
              <p className="mt-2 text-xs text-muted-foreground">
                <Link href={n.book.href ?? '/shelf'} className="font-medium text-foreground underline-offset-4 hover:underline">{n.book.title}</Link>
                {' '}by {n.book.author} · {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </li>
          ))}
        </ul>
      )}

      {page?.next != null && (
        <button type="button" onClick={showMore} disabled={loadingMore} className="self-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
          {loadingMore ? 'Loading' : 'Show more'}
        </button>
      )}
    </div>
  )
}

export default NoteSearch
