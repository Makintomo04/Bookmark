"use client"
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2, Search, X } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { SeriesBook, SeriesDetail, SeriesHit, SeriesSaveResult, SeriesUndoResult } from '@/lib/catalogueSeries'
import type { StaffWorkHit } from '@/lib/catalogueFix'
import { duplicatePositions, parsePosition } from '@/lib/catalogueSeriesRules'
import { seriesHref } from '@/lib/series'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass, staffSend } from './staffApi'
import RecentCatalogueChanges from './RecentCatalogueChanges'

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

type Book = Pick<SeriesBook, 'id' | 'title' | 'authors' | 'coverUrl' | 'seriesName' | 'seriesPosition'>
// A row in the editor: the book, its place as typed, and how it got here.
type Row = { book: Book, position: string, from: 'series' | 'merged' | 'added' }

const placeText = (p: number | null) => (p === null ? '' : String(p))
const placeOrder = (a: Row, b: Row) => {
  const pa = parsePosition(a.position), pb = parsePosition(b.position)
  const va = pa.ok && pa.value !== null ? pa.value : Infinity
  const vb = pb.ok && pb.value !== null ? pb.value : Infinity
  return va - vb || a.book.title.localeCompare(b.book.title)
}

// Find a series, then fix it in one go: places, name, other spellings, books in and out.
const StaffSeries = ({ initialName, initialQuery }: { initialName: string | null, initialQuery: string }) => {
  const [query, setQuery] = useState(initialQuery)
  const [debounced, setDebounced] = useState(initialQuery)
  const [selected, setSelected] = useState<string | null>(initialName)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])
  // With nothing typed, the series spelled more than one way.
  const { data: hits, isLoading, mutate } = useSWR<SeriesHit[]>(selected ? null : `/api/staff/series?q=${encodeURIComponent(debounced)}`, fetcher, { keepPreviousData: true })

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search series</span>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <ClearableInput className={`${fieldClass} pl-9 h-10`} placeholder="Series name, or part of it" value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); setDone(null) }} />
      </label>
      {done && <p role="status" className="text-sm text-muted-foreground">{done}</p>}

      {selected ? (
        <SeriesEditor key={selected} name={selected} onBack={() => { setSelected(null); mutate() }}
          onSaved={(r) => { setDone(`Saved. ${counted(r.changed, 'book', 'books')} changed${r.follows ? `, ${counted(r.follows, 'follower', 'followers')} moved to the new name` : ''}.`); setSelected(r.name) }} />
      ) : (
        <>
          {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
          {!debounced.trim() && hits && hits.length > 0 && <p className="text-sm text-muted-foreground">Series spelled more than one way:</p>}
          {hits && hits.length === 0 && (
            <p className="text-muted-foreground">{debounced.trim() ? 'No series by that name.' : 'No series are spelled more than one way. Search for one to edit it.'}</p>
          )}
          <ul className="flex flex-col gap-2">
            {hits?.map((s) => (
              <li key={s.name}>
                <button type="button" onClick={() => { setSelected(s.name); setDone(null) }}
                  className={`${cardClass} w-full text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-900`}>
                  <span className="block font-medium">{s.name}</span>
                  <span className="block text-sm text-muted-foreground">{counted(s.books, 'book', 'books')}</span>
                  {s.alike.length > 0 && (
                    <span className="mt-1 block text-sm text-amber-700 dark:text-amber-400">
                      Possibly the same series: {s.alike.map((a) => `${a.name} (${a.books})`).join(', ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <RecentCatalogueChanges<SeriesUndoResult> url="/api/staff/series?recent=1" undoUrl="/api/staff/series/revert"
            onUndone={(r) => { setDone(`Undone. ${counted(r.books, 'book', 'books')} put back${r.follows ? `, ${counted(r.follows, 'follow', 'follows')} moved back` : ''}.`); mutate() }} />
        </>
      )}
    </div>
  )
}

const SeriesEditor = ({ name, onBack, onSaved }: { name: string, onBack: () => void, onSaved: (r: SeriesSaveResult) => void }) => {
  const { data, error, mutate } = useSWR<SeriesDetail>(`/api/staff/series?name=${encodeURIComponent(name)}`, fetcher)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [removed, setRemoved] = useState<Book[]>([])
  const [merged, setMerged] = useState<string[]>([])
  const [rename, setRename] = useState(name)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [merging, setMerging] = useState<string | null>(null)

  const reset = (detail: SeriesDetail) => {
    setRows(detail.works.map((book) => ({ book, position: placeText(book.seriesPosition), from: 'series' })))
    setRemoved([])
    setMerged([])
    setRename(detail.name)
    setReason('')
  }
  useEffect(() => { if (data && !rows) reset(data) }, [data, rows])

  const parsed = useMemo(() => (rows ?? []).map((r) => parsePosition(r.position)), [rows])
  const invalid = parsed.some((p) => !p.ok)
  const duplicates = useMemo(() => duplicatePositions(parsed.map((p) => ({ position: p.ok ? p.value : null }))), [parsed])
  const newName = rename.replace(/\s+/g, ' ').trim()
  const dirty = !!rows && (newName !== name || merged.length > 0 || removed.length > 0
    || rows.some((r, i) => { const p = parsed[i]; return r.from !== 'series' || (p.ok && p.value !== r.book.seriesPosition) }))

  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  if (!data || !rows) return <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />

  const setPosition = (id: string, position: string) => setRows(rows.map((r) => (r.book.id === id ? { ...r, position } : r)))
  const remove = (row: Row) => {
    setRows(rows.filter((r) => r.book.id !== row.book.id))
    // A book added in this edit just goes; one already in the series is taken out on save.
    if (row.from !== 'added') setRemoved([...removed, row.book])
  }
  const putBack = (book: Book) => {
    setRemoved(removed.filter((b) => b.id !== book.id))
    setRows([...rows, { book, position: placeText(book.seriesPosition), from: book.seriesName === name ? 'series' : 'merged' }])
  }
  const add = (book: Book) => {
    if (rows.some((r) => r.book.id === book.id)) return
    const taken = removed.find((b) => b.id === book.id)
    if (taken) return putBack(taken)
    setRows([...rows, { book, position: '', from: 'added' }])
  }
  const mergeIn = async (other: string) => {
    setMerging(other)
    setSaveError(null)
    try {
      const books = await fetcher(`/api/staff/series?books=${encodeURIComponent(other)}`) as SeriesBook[]
      setRows((current) => [...(current ?? []), ...books.filter((b) => !current?.some((r) => r.book.id === b.id))
        .map((book) => ({ book, position: placeText(book.seriesPosition), from: 'merged' as const }))])
      setMerged((m) => [...m, other])
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setMerging(null)
    }
  }

  const save = async () => {
    setPending(true)
    setSaveError(null)
    try {
      const result = await staffSend<SeriesSaveResult>('/api/staff/series', 'POST', {
        name, rename: newName, merge: merged, reason,
        entries: rows.map((r) => ({ workId: r.book.id, position: r.position })),
        removed: removed.map((b) => b.id),
      })
      if (result.name === name) {
        setRows(null)
        await mutate()
      }
      onSaved(result)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  const firstAuthor = rows[0]?.book.authors[0]
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm text-muted-foreground hover:text-foreground">← Back to results</button>
      <div>
        <h2 className="text-lg font-semibold">{name}</h2>
        {firstAuthor && <Link href={seriesHref(name, firstAuthor)} className="text-sm text-brand-text hover:underline">Series page</Link>}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Name</span>
        <ClearableInput className={fieldClass} value={rename} maxLength={200} onChange={(e) => setRename(e.target.value)} />
        {newName !== name && <span className="text-sm text-muted-foreground">Every book below takes the new name when you save.</span>}
      </label>

      {data.alike.filter((a) => !merged.includes(a.name)).length > 0 && (
        <section className={`${cardClass} flex flex-col gap-2`}>
          <h3 className="font-medium">Possibly the same series</h3>
          <ul className="flex flex-col gap-1">
            {data.alike.filter((a) => !merged.includes(a.name)).map((a) => (
              <li key={a.name} className="flex flex-wrap items-center justify-between gap-2">
                <span>{a.name} <span className="text-sm text-muted-foreground">({counted(a.books, 'book', 'books')})</span></span>
                <Button size="sm" variant="outline" onClick={() => mergeIn(a.name)} disabled={merging !== null}>
                  {merging === a.name && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Merge into this series
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium">{counted(rows.length, 'book', 'books')}</h3>
          <Button size="sm" variant="ghost" onClick={() => setRows(rows.slice().sort(placeOrder))}>Sort by place</Button>
        </div>
        {duplicates.length > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            More than one book is at {duplicates.map((p) => `Book ${p}`).join(', ')}. Fine for two editions of one book, otherwise check the places.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const p = parsed[i]
            const clash = p.ok && p.value !== null && duplicates.includes(p.value)
            const elsewhere = row.from === 'added' && row.book.seriesName && row.book.seriesName !== name
            return (
              <li key={row.book.id} className={`${cardClass} flex items-center gap-3 py-2`}>
                <label className="flex flex-col gap-0.5 shrink-0">
                  <span className="sr-only">Place of {row.book.title}</span>
                  <input className={cn(fieldClass, 'w-20 h-11 pointer-fine:h-9 py-0 text-center tabular-nums', (!p.ok || clash) && 'border-amber-600 dark:border-amber-400')}
                    inputMode="decimal" placeholder="–" value={row.position} onChange={(e) => setPosition(row.book.id, e.target.value)} aria-invalid={!p.ok} />
                </label>
                <span className="min-w-0 flex-1">
                  <Link href={`/staff/catalogue?work=${row.book.id}`} className="block font-medium truncate hover:underline">{row.book.title}</Link>
                  <span className="block text-sm text-muted-foreground truncate">{row.book.authors.join(', ')}</span>
                  {!p.ok && <span className="block text-sm text-destructive">{p.error}</span>}
                  {row.from === 'merged' && <span className="block text-sm text-muted-foreground">From {row.book.seriesName}</span>}
                  {elsewhere && <span className="block text-sm text-amber-700 dark:text-amber-400">Now in {row.book.seriesName}. Saving moves it here.</span>}
                  {row.from === 'added' && !elsewhere && <span className="block text-sm text-muted-foreground">Added</span>}
                </span>
                <Button size="icon" variant="ghost" className="shrink-0" onClick={() => remove(row)} aria-label={`Take ${row.book.title} out of the series`}>
                  <X size={16} aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      </section>

      {removed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Taken out on save</h3>
          <ul className="flex flex-col gap-1">
            {removed.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{b.title}</span>
                <Button size="sm" variant="ghost" onClick={() => putBack(b)}>Put back</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AddBook onAdd={add} exclude={rows.map((r) => r.book.id)} />

      <section className={`${cardClass} flex flex-col gap-3`}>
        <ClearableInput className={fieldClass} placeholder="What was wrong (for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-label="Reason" />
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={pending || !dirty || invalid || !newName || !reason.trim()}>
            {pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Save series
          </Button>
          <Button size="sm" variant="ghost" onClick={() => reset(data)} disabled={pending || !dirty}>Undo changes</Button>
        </div>
        <p className="text-sm text-muted-foreground">Saved series and places are kept when Hardcover&rsquo;s details for a book come in.</p>
      </section>
    </div>
  )
}

// "Add a book": any book already in the catalogue, by title, author or ISBN.
const AddBook = ({ onAdd, exclude }: { onAdd: (book: Book) => void, exclude: string[] }) => {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])
  const { data: hits, isLoading } = useSWR<StaffWorkHit[]>(debounced.trim() ? `/api/staff/works?q=${encodeURIComponent(debounced)}` : null, fetcher, { keepPreviousData: true })
  const shown = hits?.filter((h) => !exclude.includes(h.id)).slice(0, 8)

  return (
    <section className={`${cardClass} flex flex-col gap-2`}>
      <h3 className="font-medium">Add a book</h3>
      <ClearableInput className={fieldClass} placeholder="Title, author or ISBN" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a book to add" />
      {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {shown && debounced.trim() && shown.length === 0 && <p className="text-sm text-muted-foreground">Nothing else in the catalogue matches that.</p>}
      <ul className="flex flex-col">
        {shown?.map((h) => (
          <li key={h.id}>
            <button type="button" onClick={() => { onAdd(h); setQuery('') }}
              className="flex min-h-11 w-full flex-col justify-center rounded-md px-2 py-1 text-left hover:bg-accent">
              <span className="block truncate">{h.title}</span>
              <span className="block text-sm text-muted-foreground truncate">
                {h.authors.join(', ')}{h.seriesName && ` · in ${h.seriesName}${h.seriesPosition !== null ? ` (${h.seriesPosition})` : ''}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default StaffSeries
