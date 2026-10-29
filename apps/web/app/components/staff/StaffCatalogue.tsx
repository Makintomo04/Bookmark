"use client"
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Loader2, Search } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { StaffWork } from '@/lib/catalogueFix'
import { bookHref, workKeyOfQuery } from '@/lib/workKey'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass, staffSend } from './staffApi'
import { UploadButton } from '@/utils/uploadthing'

type Saved = { work: StaffWork, copies: { books: number, listItems: number, circles: number } }

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

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

// Correct a book in the shared catalogue: its title, authors, description and cover, and each edition's
// pages and cover. Readers who set their own keep theirs (lib/catalogueFixRules.ts).
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
  const { data: results, isLoading } = useSWR<StaffWork[]>(debounced.trim() ? `/api/staff/works?q=${encodeURIComponent(debounced)}` : null, fetcher, { keepPreviousData: true })
  const olKey = workKeyOfQuery(debounced)

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search the catalogue</span>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <ClearableInput className={`${fieldClass} pl-9 h-10`} placeholder="Title, ISBN or Open Library id (OL45883W)" value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); setCreating(null) }} />
      </label>

      {selected ? (
        <WorkEditor id={selected} onBack={() => setSelected(null)} />
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
                    <span className="block text-xs text-muted-foreground">{w._count.books} on shelves · {w.editions.length} {w.editions.length === 1 ? 'edition' : 'editions'}{w.curatedFields.length ? ' · corrected before' : ''}{handTyped(w) ? (w.pageApprovedAt ? ' · hand-typed, has a page' : ' · hand-typed, no page') : ''}</span>
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
  const [found, setFound] = useState<StaffWork | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTitle(form.title), 300)
    return () => clearTimeout(t)
  }, [form.title])
  const { data: matches } = useSWR<StaffWork[]>(debouncedTitle.trim().length >= 3 ? `/api/staff/works?q=${encodeURIComponent(debouncedTitle.trim())}` : null, fetcher, { keepPreviousData: true })

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
const handTyped = (w: StaffWork) => !w.openLibraryKey && !w.hardcoverId

const Cover = ({ url, className }: { url: string | null, className: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  url ? <img src={url} alt="" className={`${className} shrink-0 rounded object-cover bg-neutral-100 dark:bg-neutral-800`} />
    : <span className={`${className} shrink-0 rounded bg-neutral-100 dark:bg-neutral-800`} aria-hidden />
)

const WorkEditor = ({ id, onBack }: { id: string, onBack: () => void }) => {
  const { data: work, error, mutate } = useSWR<StaffWork>(`/api/staff/works/${id}`, fetcher)
  const [form, setForm] = useState<{ title: string, authors: string, description: string, coverUrl: string, seriesName: string, seriesPosition: string } | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean, text: string } | null>(null)

  const formOf = (w: StaffWork) => ({
    title: w.title, authors: w.authors.join(', '), description: w.description ?? '', coverUrl: w.coverUrl ?? '',
    seriesName: w.seriesName ?? '', seriesPosition: w.seriesPosition?.toString() ?? '',
  })
  // Filled once. Saving an edition reloads the work too, and that mustn't wipe what's being typed here.
  useEffect(() => {
    if (work && !form) setForm(formOf(work))
  }, [work, form])

  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  if (!work || !form) return <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />

  const save = async () => {
    setPending(true)
    setMessage(null)
    // Only what changed, so an untouched field isn't marked as corrected.
    const body: Record<string, unknown> = { reason }
    if (form.title !== work.title) body.title = form.title
    if (form.authors !== work.authors.join(', ')) body.authors = form.authors
    if (form.description !== (work.description ?? '')) body.description = form.description
    if (form.coverUrl !== (work.coverUrl ?? '')) body.coverUrl = form.coverUrl
    if (form.seriesName !== (work.seriesName ?? '')) body.seriesName = form.seriesName
    if (form.seriesPosition !== (work.seriesPosition?.toString() ?? '')) body.seriesPosition = form.seriesPosition
    try {
      const saved = await staffSend<Saved>(`/api/staff/works/${id}`, 'PATCH', body)
      await mutate(saved.work, { revalidate: false })
      setForm(formOf(saved.work))
      setMessage({ ok: true, text: copiesLine(saved.copies) })
      setReason('')
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
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
        <div className="flex gap-4">
          <Cover url={form.coverUrl || null} className="h-36 w-24" />
          <div className="min-w-0 text-sm text-muted-foreground">
            <p>{work._count.books} readers have this on their shelves.</p>
            {work.openLibraryKey && <p>Open Library: <a className="text-brand-text hover:underline" href={`https://openlibrary.org/works/${work.openLibraryKey}`} target="_blank" rel="noreferrer">{work.openLibraryKey}</a></p>}
            {work.curatedFields.length > 0 && <p>Corrected before: {work.curatedFields.join(', ')}</p>}
          </div>
        </div>
        {field('title', 'Title')}
        {field('authors', 'Authors, separated by commas')}
        {field('coverUrl', 'Cover image link (https)')}
        <CoverUpload onUploaded={(url) => setForm({ ...form, coverUrl: url })} />
        <p className="-mt-2 text-xs text-muted-foreground">A new cover goes on every edition and every reader&apos;s copy, except readers&apos; own photos and editions given their own cover below.</p>
        {field('description', 'Description', true)}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
          {field('seriesName', 'Series')}
          {field('seriesPosition', 'Number in series')}
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Spell the series as its other books have it, so they show together. Use 2.5 for a novella between books 2 and 3. Hardcover&apos;s series check leaves a series set here alone.</p>
        <ClearableInput className={fieldClass} placeholder="What was wrong (optional, for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={pending}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Save book</Button>
        </div>
        {message && <p role="status" className={`text-sm ${message.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{message.text}</p>}
      </section>

      {handTyped(work) && <PageApproval work={work} onSaved={(w) => mutate(w, { revalidate: false })} />}

      {work.editions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Editions</h2>
          {work.editions.map((e) => <EditionEditor key={e.id} edition={e} onSaved={(w) => mutate(w, { revalidate: false })} />)}
        </section>
      )}
    </div>
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

const EditionEditor = ({ edition, onSaved }: { edition: StaffWork['editions'][number], onSaved: (w: StaffWork) => void }) => {
  const [pages, setPages] = useState(edition.pages?.toString() ?? '')
  const [coverUrl, setCoverUrl] = useState(edition.coverUrl ?? '')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean, text: string } | null>(null)
  const dirty = pages !== (edition.pages?.toString() ?? '') || coverUrl !== (edition.coverUrl ?? '')

  const save = async () => {
    setPending(true)
    setMessage(null)
    const body: Record<string, unknown> = {}
    if (pages !== (edition.pages?.toString() ?? '')) body.pages = pages
    if (coverUrl !== (edition.coverUrl ?? '')) body.coverUrl = coverUrl
    try {
      const saved = await staffSend<Saved>(`/api/staff/editions/${edition.id}`, 'PATCH', body)
      onSaved(saved.work)
      setMessage({ ok: true, text: copiesLine(saved.copies) })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setPending(false)
    }
  }

  const facts = [edition.format?.toLowerCase(), edition.publisher, edition.publishedYear, edition.isbn13 ?? edition.isbn10].filter(Boolean).join(' · ')
  return (
    <div className={`${cardClass} flex flex-col sm:flex-row gap-3`}>
      <Cover url={coverUrl || null} className="h-20 w-14" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground truncate">{facts || 'No details'}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="text-sm sm:w-28"><span className="sr-only">Pages</span>
            <input className={fieldClass} inputMode="numeric" placeholder="Pages" value={pages} onChange={(e) => setPages(e.target.value)} />
          </label>
          <label className="text-sm flex-1"><span className="sr-only">Cover image link</span>
            <ClearableInput className={fieldClass} placeholder="Cover image link (https)" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
          </label>
          <Button size="sm" variant="outline" onClick={save} disabled={pending || !dirty}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Save</Button>
        </div>
        {message && <p role="status" className={`text-sm ${message.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{message.text}</p>}
      </div>
    </div>
  )
}

export default StaffCatalogue
