"use client"
import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2, Search } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { StaffWork, StaffWorkHit } from '@/lib/catalogueFix'
import type { BookHistoryEntry } from '@/lib/staffLog'
import type { MergeHistoryEntry } from '@/lib/catalogueMerge'
import { EDITION_FORMATS, FIELD_LABELS } from '@/lib/catalogueFixRules'
import { mergedInto } from '@/lib/catalogueMergeRules'
import { bookHref, workKeyOfQuery } from '@/lib/workKey'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass, staffSend } from './staffApi'
import CatalogueSections from './CatalogueSections'
import { UploadButton } from '@/utils/uploadthing'

type Saved = { work: StaffWork, copies: { books: number, listItems: number, circles: number }, reports?: number }

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const copiesLine = ({ books, listItems, circles }: Saved['copies']) => {
  const parts = [
    books ? counted(books, "reader's copy", "readers' copies") : null,
    listItems ? counted(listItems, 'list entry', 'list entries') : null,
    circles ? counted(circles, 'reading circle', 'reading circles') : null,
  ].filter((p): p is string => !!p)
  if (!parts.length) return 'Saved. No readers had the old version on their shelves.'
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `Saved. Updated ${list} that still showed the old version.`
}

// Correct a book in the shared catalogue: its title, authors, description, cover, series and first year,
// and each edition's details. Readers who set their own keep theirs (lib/catalogueFixRules.ts). Every
// edit shows in the book's history, where it can be reverted.
const StaffCatalogue = ({ initialWorkId, initialQuery }: { initialWorkId: string | null, initialQuery: string }) => {
  const [query, setQuery] = useState(initialQuery)
  const [debounced, setDebounced] = useState(initialQuery)
  const [selected, setSelected] = useState<string | null>(initialWorkId)
  // "Add a book by hand", with the title it starts from.
  const [creating, setCreating] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])
  const { data: results, isLoading } = useSWR<StaffWorkHit[]>(debounced.trim() ? `/api/staff/works?q=${encodeURIComponent(debounced)}` : null, fetcher, { keepPreviousData: true })
  const olKey = workKeyOfQuery(debounced)

  return (
    <div className="flex flex-col gap-4">
      <CatalogueSections />
      <label className="relative block">
        <span className="sr-only">Search the catalogue</span>
        <Search size={16} className="pointer-events-none absolute z-10 left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <ClearableInput className={`${fieldClass} pl-9 h-10`} placeholder="Title, author, ISBN or Open Library id (OL45883W)" value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); setCreating(null) }} />
      </label>

      {selected ? (
        <WorkEditor key={selected} id={selected} onBack={() => setSelected(null)} onOpen={setSelected} />
      ) : creating !== null ? (
        <CreateByHand initialTitle={creating} onBack={() => setCreating(null)} onOpen={(id) => { setCreating(null); setSelected(id) }} />
      ) : (
        <>
          {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
          {results && results.length === 0 && (olKey
            ? <AddFromOpenLibrary olKey={olKey} onAdded={setSelected} />
            : <p className="text-muted-foreground">Nothing in the catalogue matches that.</p>)}
          {!olKey && (
            <button type="button" onClick={() => setCreating(debounced.trim())} className="self-start text-sm text-brand-text hover:underline">
              Not on Open Library or Hardcover? Add a book by hand
            </button>
          )}
          <ul className="flex flex-col gap-2">
            {results?.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => setSelected(w.id)}
                  className={`${cardClass} w-full flex items-center gap-3 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-900`}>
                  <Cover url={w.coverUrl} className="h-16 w-11" />
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{w.title}</span>
                    <span className="block text-sm text-muted-foreground truncate">{w.authors.join(', ') || 'No author'}{w.firstPublishYear ? ` · ${w.firstPublishYear}` : ''}</span>
                    <span className="block text-xs text-muted-foreground">{w._count.books} on shelves · {counted(w._count.editions, 'edition', 'editions')}{w.curatedFields.length ? ' · corrected before' : ''}{handTyped(w) ? (w.pageApprovedAt ? ' · hand-typed, has a page' : ' · hand-typed, no page') : ''}{mergedInto(w.key) ? ' · merged into another book' : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// A book page can show a book from Open Library that no reader has shelved, so the catalogue has no row
// for it yet. Filing it gives the librarian something to correct.
const AddFromOpenLibrary = ({ olKey, onAdded }: { olKey: string, onAdded: (id: string) => void }) => {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = async () => {
    setPending(true)
    setError(null)
    try {
      onAdded((await staffSend<StaffWork>('/api/staff/works', 'POST', { openLibraryKey: olKey })).id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className={`${cardClass} flex flex-col gap-3`}>
      <p className="text-sm text-muted-foreground">{olKey} isn&apos;t in the catalogue yet: nobody has shelved it, so its book page comes straight from Open Library. Add it to correct it.</p>
      <Button size="sm" className="self-start" onClick={add} disabled={pending}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Add from Open Library</Button>
      {error && <p role="status" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

// A book neither Open Library nor Hardcover has, filed with a book page straight away. Books already in the
// catalogue under a similar title are listed first, since a second copy of a book splits its readers.
const CreateByHand = ({ initialTitle, onBack, onOpen }: { initialTitle: string, onBack: () => void, onOpen: (id: string) => void }) => {
  const [form, setForm] = useState({ title: initialTitle, authors: '', description: '', coverUrl: '', seriesName: '', seriesPosition: '' })
  const [debouncedTitle, setDebouncedTitle] = useState(initialTitle)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Filed already under this title and first author.
  const [found, setFound] = useState<StaffWorkHit | StaffWork | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTitle(form.title), 300)
    return () => clearTimeout(t)
  }, [form.title])
  const { data: matches } = useSWR<StaffWorkHit[]>(debouncedTitle.trim().length >= 3 ? `/api/staff/works?q=${encodeURIComponent(debouncedTitle.trim())}` : null, fetcher, { keepPreviousData: true })

  const create = async () => {
    setPending(true)
    setError(null)
    setFound(null)
    try {
      const body: Record<string, unknown> = { title: form.title, authors: form.authors }
      for (const k of ['description', 'coverUrl', 'seriesName', 'seriesPosition'] as const) if (form[k].trim()) body[k] = form[k]
      const { work, created } = await staffSend<{ work: StaffWork, created: boolean }>('/api/staff/works', 'POST', body)
      if (created) onOpen(work.id)
      else setFound(work)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  const field = (key: keyof typeof form, label: string, multiline = false) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {multiline
        ? <textarea className={fieldClass} rows={5} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        : <ClearableInput className={fieldClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}
    </label>
  )

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm text-brand-text hover:underline">← Back to results</button>
      <section className={`${cardClass} flex flex-col gap-4`}>
        <h2 className="font-semibold">Add a book by hand</h2>
        <p className="text-sm text-muted-foreground">For a real, published book that neither Open Library nor Hardcover has. It gets a book page straight away, and readers who type in the same title and author join it.</p>
        {field('title', 'Title')}
        {matches && matches.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Already in the catalogue? Correct that one instead.</p>
            <ul className="flex flex-col gap-1">
              {matches.slice(0, 5).map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => onOpen(w.id)} className="flex items-center gap-2 text-left text-sm hover:underline">
                    <Cover url={w.coverUrl} className="h-9 w-6" />
                    <span className="truncate">{w.title} · {w.authors.join(', ') || 'No author'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {field('authors', 'Authors, separated by commas')}
        {field('coverUrl', 'Cover image link (https, optional)')}
        <CoverUpload onUploaded={(url) => setForm({ ...form, coverUrl: url })} />
        {field('description', 'Description (optional)', true)}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
          {field('seriesName', 'Series (optional)')}
          {field('seriesPosition', 'Number in series')}
        </div>
        <Button size="sm" className="self-start" onClick={create} disabled={pending || !form.title.trim() || !form.authors.trim()}>
          {pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Add to the catalogue
        </Button>
        {error && <p role="status" className="text-sm text-destructive">{error}</p>}
        {found && (
          <p role="status" className="text-sm text-muted-foreground">
            {found.title} by {found.authors.join(', ')} is already in the catalogue.{' '}
            <button type="button" onClick={() => onOpen(found.id)} className="text-brand-text hover:underline">Open it to correct it</button>
          </p>
        )}
      </section>
    </div>
  )
}

// Or upload the cover instead of linking to one. It fills the link field, so saving works as for a link.
const CoverUpload = ({ onUploaded }: { onUploaded: (url: string) => void }) => {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="-mt-2 flex flex-col items-start gap-1">
      <UploadButton
        endpoint="catalogueCover"
        className="items-start ut-button:h-9 ut-button:bg-brand-fill ut-button:text-sm ut-allowed-content:text-muted-foreground"
        content={{ button: ({ isUploading }) => (isUploading ? 'Uploading…' : 'Or upload a cover') }}
        onUploadBegin={() => setError(null)}
        onClientUploadComplete={(res) => { if (res[0]?.url) onUploaded(res[0].url) }}
        onUploadError={(e: Error) => setError(e.message || 'Upload failed. Try another image.')}
      />
      {error && <p role="status" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

// Neither Open Library nor Hardcover has it: a reader typed it in, so it has a page only if a librarian gave it one.
const handTyped = (w: { openLibraryKey: string | null, hardcoverId: string | null }) => !w.openLibraryKey && !w.hardcoverId

export const Cover = ({ url, className }: { url: string | null, className: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  url ? <img src={url} alt="" className={`${className} shrink-0 rounded object-cover bg-neutral-100 dark:bg-neutral-800`} />
    : <span className={`${className} shrink-0 rounded bg-neutral-100 dark:bg-neutral-800`} aria-hidden />
)

type WorkForm = { title: string, authors: string, description: string, coverUrl: string, seriesName: string, seriesPosition: string, firstPublishYear: string }

const workFormOf = (w: StaffWork): WorkForm => ({
  title: w.title, authors: w.authors.join(', '), description: w.description ?? '', coverUrl: w.coverUrl ?? '',
  seriesName: w.seriesName ?? '', seriesPosition: w.seriesPosition?.toString() ?? '', firstPublishYear: w.firstPublishYear?.toString() ?? '',
})

type History = { history: BookHistoryEntry[], merges?: MergeHistoryEntry[], openReports: number }

// Editions shown before "Show all": most books have a few, a classic can have dozens.
const EDITIONS_SHOWN = 10

const WorkEditor = ({ id, onBack, onOpen }: { id: string, onBack: () => void, onOpen: (id: string) => void }) => {
  const { data: work, error, mutate } = useSWR<StaffWork>(`/api/staff/works/${id}`, fetcher)
  const { data: history, mutate: mutateHistory } = useSWR<History>(`/api/staff/works/${id}/history`, fetcher)
  const [form, setForm] = useState<WorkForm | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean, text: string } | null>(null)
  const [allEditions, setAllEditions] = useState(false)
  // Bumped by a revert, so the edition editors start again from the reverted values.
  const [revision, setRevision] = useState(0)
  // What the last edition move did, since the moved edition's own editor is gone.
  const [moved, setMoved] = useState<string | null>(null)

  // Filled once. Saving an edition reloads the work too, and that mustn't wipe what's being typed here.
  useEffect(() => {
    if (work && !form) setForm(workFormOf(work))
  }, [work, form])

  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  if (!work || !form) return <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />

  const initial = workFormOf(work)
  const dirty = (Object.keys(initial) as (keyof WorkForm)[]).some((k) => form[k] !== initial[k])
  const openReports = history?.openReports ?? 0

  const save = async () => {
    setPending(true)
    setMessage(null)
    // Only what changed, so an untouched field isn't marked as corrected.
    const body: Record<string, unknown> = { reason }
    for (const k of Object.keys(initial) as (keyof WorkForm)[]) if (form[k] !== initial[k]) body[k] = form[k]
    try {
      const saved = await staffSend<Saved>(`/api/staff/works/${id}`, 'PATCH', body)
      await mutate(saved.work, { revalidate: false })
      setForm(workFormOf(saved.work))
      setMessage({ ok: true, text: `${copiesLine(saved.copies)}${saved.reports ? ` Closed ${counted(saved.reports, 'open report', 'open reports')} about this book.` : ''}` })
      setReason('')
      void mutateHistory()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setPending(false)
    }
  }

  const editionSaved = (w: StaffWork) => {
    void mutate(w, { revalidate: false })
    void mutateHistory()
  }

  const reverted = (w: StaffWork) => {
    // What's being typed stays; an untouched form shows the reverted book.
    if (!dirty) setForm(workFormOf(w))
    setRevision((r) => r + 1)
    editionSaved(w)
  }

  const editionMoved = (w: StaffWork, text: string) => {
    editionSaved(w)
    setMoved(text)
  }

  const history$ = <BookHistory workId={work.id} entries={history?.history} merges={history?.merges} onReverted={reverted} onOpen={onOpen} />
  const survivorId = mergedInto(work.key)
  // A merged duplicate has nothing left to correct: its readers are on the book it went into. Its history
  // still has the merge, to undo it.
  if (survivorId) {
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={onBack} className="self-start min-h-11 pointer-fine:min-h-0 text-sm text-brand-text hover:underline">← Back to results</button>
        <section className={`${cardClass} flex gap-4`}>
          <Cover url={work.coverUrl} className="h-24 w-16" />
          <div className="min-w-0 flex flex-col gap-2 text-sm">
            <p className="font-medium">{work.title}</p>
            <p className="text-muted-foreground">Merged into another book: its editions and readers are there now.</p>
            <Button size="sm" variant="outline" className="self-start" onClick={() => onOpen(survivorId)}>Open that book</Button>
          </div>
        </section>
        {history$}
      </div>
    )
  }

  const field = (key: keyof WorkForm, label: string, multiline = false, inputMode?: 'numeric' | 'decimal') => (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {multiline
        ? <textarea className={fieldClass} rows={5} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        : <ClearableInput className={fieldClass} inputMode={inputMode} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}
    </label>
  )

  const editions = allEditions ? work.editions : work.editions.slice(0, EDITIONS_SHOWN)

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start min-h-11 pointer-fine:min-h-0 text-sm text-brand-text hover:underline">← Back to results</button>
      <section className={`${cardClass} flex flex-col gap-4`}>
        <div className="flex gap-4">
          <Cover url={form.coverUrl || null} className="h-36 w-24" />
          <div className="min-w-0 text-sm text-muted-foreground">
            <p>{work._count.books} readers have this on their shelves.</p>
            {work.openLibraryKey && <p>Open Library: <a className="text-brand-text hover:underline" href={`https://openlibrary.org/works/${work.openLibraryKey}`} target="_blank" rel="noreferrer">{work.openLibraryKey}</a></p>}
            {work.curatedFields.length > 0 && <p>Corrected before: {work.curatedFields.map((f) => FIELD_LABELS[f]?.toLowerCase() ?? f).join(', ')}. What changed is under History.</p>}
          </div>
        </div>
        {field('title', 'Title')}
        {field('authors', 'Authors, separated by commas')}
        {field('coverUrl', 'Cover image link (https)')}
        <CoverUpload onUploaded={(url) => setForm({ ...form, coverUrl: url })} />
        <p className="-mt-2 text-xs text-muted-foreground">A new cover goes on every edition and every reader&apos;s copy, except readers&apos; own photos and editions given their own cover below.</p>
        {field('description', 'Description', true)}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px_140px]">
          {field('seriesName', 'Series')}
          {field('seriesPosition', 'Number in series', false, 'decimal')}
          {field('firstPublishYear', 'First published', false, 'numeric')}
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Spell the series as its other books have it, so they show together. Use 2.5 for a novella between books 2 and 3. Hardcover&apos;s series check leaves a series set here alone. First published is the year of the first edition anywhere.</p>
        <ClearableInput className={fieldClass} placeholder="What was wrong (optional, for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        {openReports > 0 && dirty && (
          <p className="text-sm text-muted-foreground">Saving also closes {counted(openReports, 'open report', 'open reports')} about this book.</p>
        )}
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={pending || !dirty}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Save book</Button>
        </div>
        {message && <p role="status" className={`text-sm ${message.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{message.text}</p>}
      </section>

      {handTyped(work) && <PageApproval work={work} onSaved={(w) => mutate(w, { revalidate: false })} />}

      <MergeInto work={work} onMerged={onOpen} />

      {work.editions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Editions</h2>
          {moved && <p role="status" className="text-sm text-muted-foreground">{moved}</p>}
          {editions.map((e) => <EditionEditor key={`${e.id}:${revision}`} edition={e} workId={work.id} onSaved={editionSaved} onMoved={editionMoved} />)}
          {!allEditions && work.editions.length > EDITIONS_SHOWN && (
            <Button size="sm" variant="outline" className="self-start" onClick={() => setAllEditions(true)}>Show all {work.editions.length} editions</Button>
          )}
        </section>
      )}

      {history$}
    </div>
  )
}

const shown = (field: string, value: unknown) => {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return 'empty'
  if (Array.isArray(value)) return value.join(', ')
  if (field === 'format' && typeof value === 'string') return value.toLowerCase()
  const text = String(value)
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

// Recent edits to this book and its editions (lib/staffLog.ts bookHistory), old and new value for each
// field. Reverting puts the old values back, unless someone has changed one of those fields since.
type Item = { kind: 'edit', entry: BookHistoryEntry } | { kind: 'merge', entry: MergeHistoryEntry }

const BookHistory = ({ workId, entries, merges, onReverted, onOpen }: {
  workId: string, entries: BookHistoryEntry[] | undefined, merges: MergeHistoryEntry[] | undefined, onReverted: (w: StaffWork) => void, onOpen: (id: string) => void
}) => {
  if (!entries) return null
  // Edits, and merges and edition moves (lib/catalogueMerge.ts mergeHistory), newest first.
  const items: Item[] = [
    ...entries.map((entry) => ({ kind: 'edit' as const, entry })),
    ...(merges ?? []).map((entry) => ({ kind: 'merge' as const, entry })),
  ].sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt))
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">History</h2>
        <Link href={`/staff/log?target=${workId}`} className="inline-flex items-center min-h-11 pointer-fine:min-h-0 text-sm text-brand-text hover:underline">Everything in the log</Link>
      </div>
      {items.length === 0
        ? <p className="text-sm text-muted-foreground">Nobody has corrected this book here yet.</p>
        : <ol className="flex flex-col gap-2">{items.map((i) => i.kind === 'edit'
          ? <HistoryItem key={i.entry.id} entry={i.entry} onReverted={onReverted} />
          : <MergeItem key={i.entry.id} workId={workId} entry={i.entry} onUndone={onReverted} onOpen={onOpen} />)}</ol>}
    </section>
  )
}

const HistoryItem = ({ entry, onReverted }: { entry: BookHistoryEntry, onReverted: (w: StaffWork) => void }) => {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changes = entry.changes.filter((c) => c.field in FIELD_LABELS)

  const revert = async () => {
    setPending(true)
    setError(null)
    try {
      const path = entry.targetType === 'edition' ? `/api/staff/editions/${entry.targetId}/revert` : `/api/staff/works/${entry.targetId}/revert`
      const saved = await staffSend<Saved>(path, 'POST', { actionId: entry.id, reason })
      setConfirming(false)
      onReverted(saved.work)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <li className={`${cardClass} flex flex-col gap-2 text-sm`}>
      <p>
        <span className="font-medium">@{entry.actor}</span> {entry.label.toLowerCase()}
        {entry.edition && <span className="text-muted-foreground"> ({entry.edition})</span>}
        <span className="text-muted-foreground"> · {when(entry.createdAt)}</span>
      </p>
      {changes.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          {changes.map((c) => (
            <Fragment key={c.field}>
              <dt className="text-muted-foreground">{FIELD_LABELS[c.field]}</dt>
              <dd className="break-words">
                {c.field === 'coverUrl'
                  ? <span className="inline-flex items-center gap-2"><Cover url={typeof c.from === 'string' ? c.from : null} className="h-9 w-6" /> → <Cover url={typeof c.to === 'string' ? c.to : null} className="h-9 w-6" /></span>
                  : <><span className="text-muted-foreground line-through decoration-1">{shown(c.field, c.from)}</span> → {shown(c.field, c.to)}</>}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      {entry.reason && <p>“{entry.reason}”</p>}
      {entry.reverted ? (
        <p className="text-muted-foreground">Reverted since.</p>
      ) : confirming ? (
        <div className="flex flex-col gap-2">
          <ClearableInput className={fieldClass} placeholder="Why it's being reverted (optional, for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div className="flex gap-2">
            <Button size="sm" onClick={revert} disabled={pending}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Put the old values back</Button>
            <Button size="sm" variant="ghost" onClick={() => { setConfirming(false); setError(null) }} disabled={pending}>Cancel</Button>
          </div>
        </div>
      ) : changes.length > 0 && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setConfirming(true)}>Revert</Button>
      )}
      {error && <p role="status" className="text-destructive">{error}</p>}
    </li>
  )
}

// A hand-typed book gets a page once a librarian has checked it's a real, published book and not someone's
// private note (lib/workPages.ts). Its page then shows the title, authors, cover and description above.
const PageApproval = ({ work, onSaved }: { work: StaffWork, onSaved: (w: StaffWork) => void }) => {
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const approved = !!work.pageApprovedAt
  const href = bookHref({ workKey: null, pageWorkId: work.id, title: work.title })

  const send = async () => {
    setPending(true)
    setError(null)
    try {
      onSaved(await staffSend<StaffWork>(`/api/staff/works/${work.id}/page`, approved ? 'DELETE' : 'PUT', { reason }))
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className={`${cardClass} flex flex-col gap-3`}>
      <h2 className="font-semibold">Book page</h2>
      {approved ? (
        <p className="text-sm text-muted-foreground">
          Approved on {new Date(work.pageApprovedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.{' '}
          {href && <a className="text-brand-text hover:underline" href={href} target="_blank" rel="noreferrer">Open its page</a>}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Neither Open Library nor Hardcover has this book, so a reader typed it in and it has no page. Give it one once you&apos;ve checked it&apos;s a real, published book and not someone&apos;s private note. Fix the details above first: the page shows them to everyone.</p>
      )}
      <ClearableInput className={fieldClass} placeholder={approved ? 'Why it should come down (optional, for the log)' : 'How you checked it (optional, for the log)'} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      <Button size="sm" variant={approved ? 'outline' : 'default'} className="self-start" onClick={send} disabled={pending}>
        {pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}{approved ? 'Take the page down' : 'Give it a book page'}
      </Button>
      {error && <p role="status" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}

type Edition = StaffWork['editions'][number]
type EditionForm = { pages: string, coverUrl: string, isbn13: string, isbn10: string, publisher: string, publishedYear: string, format: string }

const editionFormOf = (e: Edition): EditionForm => ({
  pages: e.pages?.toString() ?? '', coverUrl: e.coverUrl ?? '', isbn13: e.isbn13 ?? '', isbn10: e.isbn10 ?? '',
  publisher: e.publisher ?? '', publishedYear: e.publishedYear?.toString() ?? '', format: e.format ?? '',
})

const FORMAT_LABELS: Record<string, string> = { PAPERBACK: 'Paperback', HARDCOVER: 'Hardcover', EBOOK: 'Ebook', AUDIOBOOK: 'Audiobook' }

const EditionEditor = ({ edition, workId, onSaved, onMoved }: { edition: Edition, workId: string, onSaved: (w: StaffWork) => void, onMoved: (w: StaffWork, text: string) => void }) => {
  const initial = editionFormOf(edition)
  const [form, setForm] = useState(initial)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean, text: string } | null>(null)
  const changed = (Object.keys(initial) as (keyof EditionForm)[]).filter((k) => form[k] !== initial[k])

  const save = async () => {
    setPending(true)
    setMessage(null)
    const body: Record<string, unknown> = { reason }
    for (const k of changed) body[k] = form[k]
    try {
      const saved = await staffSend<Saved>(`/api/staff/editions/${edition.id}`, 'PATCH', body)
      onSaved(saved.work)
      const now = saved.work.editions.find((e) => e.id === edition.id)
      if (now) setForm(editionFormOf(now))
      setReason('')
      setMessage({ ok: true, text: copiesLine(saved.copies) })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setPending(false)
    }
  }

  const input = (key: keyof EditionForm, label: string, props: { inputMode?: 'numeric', placeholder?: string } = {}) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <ClearableInput className={fieldClass} {...props} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  )

  const facts = [initial.format && FORMAT_LABELS[initial.format]?.toLowerCase(), edition.publisher, edition.publishedYear, edition.isbn13 ?? edition.isbn10].filter(Boolean).join(' · ')
  return (
    <div className={`${cardClass} flex flex-col sm:flex-row gap-3`}>
      <Cover url={form.coverUrl || null} className="h-20 w-14" />
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground truncate">{facts || 'No details'}</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Format
            <select className={`${fieldClass} h-11 pointer-fine:h-9 py-0`} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
              <option value="">Not known</option>
              {EDITION_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
            </select>
          </label>
          {input('pages', 'Pages', { inputMode: 'numeric' })}
          {input('publishedYear', 'Published', { inputMode: 'numeric', placeholder: 'Year' })}
          {input('publisher', 'Publisher')}
          <div className="col-span-2">{input('isbn13', 'ISBN-13', { inputMode: 'numeric' })}</div>
          <div className="col-span-2">{input('isbn10', 'ISBN-10')}</div>
          <div className="col-span-2 sm:col-span-4">{input('coverUrl', 'Cover image link (https)')}</div>
        </div>
        {changed.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="flex-1"><span className="sr-only">Reason</span>
              <ClearableInput className={fieldClass} placeholder="What was wrong (optional, for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </label>
            <Button size="sm" variant="outline" onClick={save} disabled={pending}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Save edition</Button>
          </div>
        )}
        {message && <p role="status" className={`text-sm ${message.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{message.text}</p>}
        <MoveEdition editionId={edition.id} workId={workId} onMoved={onMoved} />
      </div>
    </div>
  )
}

export default StaffCatalogue

// Find another book in the catalogue: for a merge or an edition move. This book and merged duplicates are left out.
const WorkPicker = ({ excludeId, onPick }: { excludeId: string, onPick: (w: StaffWorkHit) => void }) => {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])
  const { data, isLoading } = useSWR<StaffWorkHit[]>(debounced.trim() ? `/api/staff/works?q=${encodeURIComponent(debounced)}` : null, fetcher, { keepPreviousData: true })
  const hits = data?.filter((w) => w.id !== excludeId && !mergedInto(w.key)).slice(0, 8)
  return (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <span className="sr-only">Find the other book</span>
        <Search size={16} className="pointer-events-none absolute z-10 left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <ClearableInput className={`${fieldClass} pl-9`} placeholder="Title, author, ISBN or id" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </label>
      {isLoading && <Loader2 size={16} className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {hits && debounced.trim() && hits.length === 0 && <p className="text-sm text-muted-foreground">Nothing else in the catalogue matches that.</p>}
      <ul className="flex flex-col gap-1">
        {hits?.map((w) => (
          <li key={w.id}>
            <button type="button" onClick={() => onPick(w)} className="flex w-full min-h-11 items-center gap-2 rounded-md px-1 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900">
              <Cover url={w.coverUrl} className="h-9 w-6" />
              <span className="min-w-0 truncate">{w.title} · {w.authors.join(', ') || 'No author'} <span className="text-muted-foreground">· {w._count.books} on shelves</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Pick a book, confirm with a reason (required: it's kept in the staff log), send. Shared by "Merge into
// another book" and "Move to another book".
const PickAndConfirm = ({ excludeId, open, onOpenChange, confirmText, action, placeholder, send }: {
  excludeId: string, open: boolean, onOpenChange: (open: boolean) => void, confirmText: (w: StaffWorkHit) => React.ReactNode,
  action: string, placeholder: string, send: (target: StaffWorkHit, reason: string) => Promise<void>,
}) => {
  const [target, setTarget] = useState<StaffWorkHit | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { onOpenChange(false); setTarget(null); setReason(''); setError(null) }
  if (!open) return null
  const confirm = async () => {
    if (!target) return
    setPending(true)
    setError(null)
    try {
      await send(target, reason)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {target ? (
        <>
          <div className="flex items-center gap-3 text-sm">
            <Cover url={target.coverUrl} className="h-12 w-8" />
            <p className="min-w-0">{confirmText(target)}</p>
          </div>
          <ClearableInput className={fieldClass} placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={confirm} disabled={pending || !reason.trim()}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}{action}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setTarget(null); setError(null) }} disabled={pending}>Choose another</Button>
            <Button size="sm" variant="ghost" onClick={close} disabled={pending}>Cancel</Button>
          </div>
        </>
      ) : (
        <>
          <WorkPicker excludeId={excludeId} onPick={setTarget} />
          <Button size="sm" variant="ghost" className="self-start" onClick={close}>Cancel</Button>
        </>
      )}
      {error && <p role="status" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

// The same book filed twice: everything on this one (editions, readers' copies, lists, circles, tags,
// reports) moves to the other, which keeps its own details and fills in what it lacks from this one.
const MergeInto = ({ work, onMerged }: { work: StaffWork, onMerged: (id: string) => void }) => {
  const [open, setOpen] = useState(false)
  return (
    <section className={`${cardClass} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Same book as another?</h2>
        {!open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Merge into another book…</Button>}
      </div>
      {open && <p className="text-sm text-muted-foreground">Find the copy of this book to keep. Everything here moves to it. Readers with both keep one copy, or both if each holds something the other would lose. It can be undone from that book&apos;s history.</p>}
      <PickAndConfirm excludeId={work.id} open={open} onOpenChange={setOpen} action="Merge" placeholder="Why they're the same book (kept in the staff log)"
        confirmText={(t) => <>Merge <span className="font-medium">{work.title}</span> ({work._count.books} on shelves) into <span className="font-medium">{t.title}</span> by {t.authors.join(', ') || 'no author'} ({t._count.books} on shelves)?</>}
        send={async (t, reason) => {
          const saved = await staffSend<{ work: StaffWork }>(`/api/staff/works/${work.id}/merge`, 'POST', { intoId: t.id, reason })
          onMerged(saved.work.id)
        }} />
    </section>
  )
}

// An edition filed under the wrong book moves to the right one, with readers' copies of it.
const MoveEdition = ({ editionId, workId, onMoved }: { editionId: string, workId: string, onMoved: (w: StaffWork, text: string) => void }) => {
  const [open, setOpen] = useState(false)
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="self-start inline-flex items-center min-h-11 pointer-fine:min-h-0 text-sm text-brand-text hover:underline">Move to another book…</button>
  return (
    <PickAndConfirm excludeId={workId} open={open} onOpenChange={setOpen} action="Move edition" placeholder="Why it belongs there (kept in the staff log)"
      confirmText={(t) => <>Move this edition, and readers&apos; copies of it, to <span className="font-medium">{t.title}</span> by {t.authors.join(', ') || 'no author'}?</>}
      send={async (t, reason) => {
        const saved = await staffSend<{ work: StaffWork, copies: number, keptBoth: number }>(`/api/staff/editions/${editionId}/move`, 'POST', { toWorkId: t.id, reason })
        onMoved(saved.work, `Moved an edition and ${counted(saved.copies, "reader's copy", "readers' copies")} to ${t.title}.${keptBothLine(saved.keptBoth)} It can be undone from History.`)
      }} />
  )
}

// Readers left with two copies of the book, since folding them would have lost a review, a rating or a read.
export const keptBothLine = (n: number) => n ? ` ${counted(n, 'reader keeps', 'readers keep')} both copies, since each holds something the other would lose.` : ''

// A merge or an edition move this book was part of, or the undoing of one. One not yet undone can be,
// unless something has changed since that makes it unsafe; the server says what.
const MergeItem = ({ workId, entry, onUndone, onOpen }: { workId: string, entry: MergeHistoryEntry, onUndone: (w: StaffWork) => void, onOpen: (id: string) => void }) => {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const other = entry.other.id
    ? <button type="button" onClick={() => onOpen(entry.other.id!)} className="text-brand-text hover:underline">{entry.other.title ?? 'another book'}</button>
    : <span>{entry.other.title ?? 'another book'}</span>
  const what = entry.kind === 'merge'
    ? (entry.isDuplicate ? <>merged this book into {other}</> : <>merged {other} into this book</>)
    : entry.kind === 'unmerge'
      ? (entry.isDuplicate ? <>undid merging this book into {other}</> : <>undid merging {other} into this book</>)
      : entry.kind === 'move'
        ? (entry.incoming ? <>moved an edition here from {other}</> : <>moved an edition to {other}</>)
        : (entry.incoming ? <>moved an edition back here from {other}</> : <>moved an edition back to {other}</>)
  const undoable = entry.kind === 'merge' || entry.kind === 'move'

  const undo = async () => {
    setPending(true)
    setError(null)
    try {
      const saved = entry.kind === 'merge'
        ? await staffSend<{ work: StaffWork }>(`/api/staff/works/${workId}/unmerge`, 'POST', { actionId: entry.id, reason })
        : await staffSend<{ work: StaffWork }>(`/api/staff/editions/${entry.editionId}/unmove`, 'POST', { actionId: entry.id, reason, workId })
      setConfirming(false)
      onUndone(saved.work)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <li className={`${cardClass} flex flex-col gap-2 text-sm`}>
      <p>
        <span className="font-medium">@{entry.actor}</span> {what}
        <span className="text-muted-foreground"> · {when(entry.createdAt)}</span>
      </p>
      {entry.copies != null && entry.kind !== 'unmerge' && <p className="text-muted-foreground">{counted(entry.copies, "reader's copy", "readers' copies")} moved.{keptBothLine(entry.keptBoth)}</p>}
      {entry.reason && <p>“{entry.reason}”</p>}
      {undoable && (entry.undone ? (
        <p className="text-muted-foreground">Undone since.</p>
      ) : confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">{entry.kind === 'merge' ? 'Everything the merge moved goes back' : 'The edition goes back with the copies that moved with it'}, and readers&apos; folded copies come back as they were.</p>
          <ClearableInput className={fieldClass} placeholder="Why it's being undone (kept in the staff log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div className="flex gap-2">
            <Button size="sm" onClick={undo} disabled={pending || !reason.trim()}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}{entry.kind === 'merge' ? 'Undo the merge' : 'Undo the move'}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setConfirming(false); setError(null) }} disabled={pending}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setConfirming(true)}>Undo</Button>
      ))}
      {error && <p role="status" className="text-destructive">{error}</p>}
    </li>
  )
}
