"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2, Search } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { AuthorHit } from '@/lib/catalogueAuthorRules'
import type { AuthorChangeCount, AuthorChangeResult, AuthorUndoResult, AuthorWork } from '@/lib/catalogueAuthors'
import { authorHref } from '@/lib/authorNames'
import type { ProfileValues as AuthorProfileValues } from '@/lib/authorProfileRules'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass, staffSend } from './staffApi'
import RecentCatalogueChanges from './RecentCatalogueChanges'

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

type Change = { kind: 'rename', from: string, to: string } | { kind: 'merge', names: string[], keys: string[], to: string, key: string | null }

// Rename an author everywhere, or merge spellings of one author into one name and Open Library key.
const StaffAuthors = ({ initialName, initialQuery }: { initialName: string | null, initialQuery: string }) => {
  const [query, setQuery] = useState(initialQuery)
  const [debounced, setDebounced] = useState(initialQuery)
  const [selected, setSelected] = useState<string | null>(initialName)
  // Names ticked for a merge, with their keys.
  const [ticked, setTicked] = useState<AuthorHit[]>([])
  const [merging, setMerging] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])
  const { data: hits, isLoading, mutate } = useSWR<AuthorHit[]>(debounced.trim() ? `/api/staff/authors?q=${encodeURIComponent(debounced)}` : null, fetcher, { keepPreviousData: true })

  const toggle = (hit: AuthorHit) =>
    setTicked((t) => t.some((h) => h.name === hit.name) ? t.filter((h) => h.name !== hit.name) : [...t, hit])
  const finished = (message: string, name: string | null) => {
    setDone(message)
    setTicked([])
    setMerging(false)
    setSelected(name)
    mutate()
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search authors</span>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <ClearableInput className={`${fieldClass} pl-9 h-10`} placeholder="Author's name, or part of it" value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); setMerging(false); setDone(null) }} />
      </label>
      {done && <p role="status" className="text-sm text-muted-foreground">{done}</p>}

      {selected ? (
        <AuthorEditor name={selected} onBack={() => setSelected(null)} onDone={finished} />
      ) : merging && ticked.length >= 2 ? (
        <MergeAuthors names={ticked} onBack={() => setMerging(false)} onDone={finished} />
      ) : (
        <>
          {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
          {hits && hits.length === 0 && <p className="text-muted-foreground">No books have an author by that name.</p>}
          {hits && hits.length > 1 && <p className="text-sm text-muted-foreground">Tick two or more spellings of one author to merge them.</p>}
          <ul className="flex flex-col gap-2">
            {hits?.map((h) => (
              <li key={h.name} className={`${cardClass} flex items-center gap-1 p-0`}>
                <label className="flex size-11 shrink-0 items-center justify-center cursor-pointer">
                  <span className="sr-only">Merge {h.name}</span>
                  <input type="checkbox" className="size-4 accent-brand" checked={ticked.some((t) => t.name === h.name)} onChange={() => toggle(h)} />
                </label>
                <button type="button" onClick={() => setSelected(h.name)} className="min-w-0 flex-1 py-3 pr-4 text-left">
                  <span className="block font-medium truncate">{h.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {counted(h.books, 'book', 'books')}{h.keys.length > 0 && ` · ${h.keys.join(', ')}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {ticked.length >= 2 && (
            <Button size="sm" className="self-start" onClick={() => setMerging(true)}>Merge {ticked.length} names</Button>
          )}
          <RecentCatalogueChanges<AuthorUndoResult> url="/api/staff/authors?recent=1" undoUrl="/api/staff/authors/revert"
            onUndone={(r) => { setDone(undoneLine(r)); mutate() }} />
        </>
      )}
    </div>
  )
}

const resultLine = (r: AuthorChangeResult) => {
  const parts = [counted(r.books, 'book', 'books'), counted(r.copies, "reader's copy", "readers' copies")]
  if (r.listItems) parts.push(counted(r.listItems, 'list entry', 'list entries'))
  if (r.circles) parts.push(counted(r.circles, 'reading circle', 'reading circles'))
  const follows = r.follows ? ` ${counted(r.follows, 'follower', 'followers')} moved across.` : ''
  return `Done. Updated ${parts.join(', ')}.${follows}`
}

const undoneLine = (r: AuthorUndoResult) =>
  `Undone. ${counted(r.books, 'book', 'books')} and ${counted(r.copies, "reader's copy", "readers' copies")} put back${r.follows ? `, ${counted(r.follows, 'follow', 'follows')} moved back` : ''}.`

// The bio and photo the author page shows in place of Open Library's. Empty fields use Open Library's.
const ProfileEditor = ({ name }: { name: string }) => {
  const { data, mutate } = useSWR<AuthorProfileValues>(`/api/staff/authors?profile=${encodeURIComponent(name)}`, fetcher)
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setBio(data?.bio ?? ''); setPhotoUrl(data?.photoUrl ?? ''); setSaved(false) }, [data])

  const save = async () => {
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      mutate(await staffSend<AuthorProfileValues>('/api/staff/authors', 'POST', { kind: 'profile', name, bio, photoUrl, reason }), { revalidate: false })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }
  const changed = (data?.bio ?? '') !== bio.trim() || (data?.photoUrl ?? '') !== photoUrl.trim()

  return (
    <section className={`${cardClass} flex flex-col gap-3`}>
      <h3 className="font-medium">Bio and photo</h3>
      <p className="text-sm text-muted-foreground">
        Shown on the author page instead of Open Library&rsquo;s. Leave a field empty to use Open Library&rsquo;s. These are kept with the current spelling of the name, so renaming or merging starts them afresh.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Bio
        <textarea className={`${fieldClass} min-h-32`} value={bio} maxLength={4000} disabled={!data} onChange={(e) => setBio(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Photo link (https)
        <ClearableInput className={fieldClass} value={photoUrl} disabled={!data} onChange={(e) => setPhotoUrl(e.target.value)} />
      </label>
      {photoUrl.trim().startsWith('https://') && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl.trim()} alt="" className="size-20 rounded-full object-cover bg-neutral-200 dark:bg-neutral-800" />
      )}
      <ClearableInput className={fieldClass} value={reason} aria-label="Note for the log" placeholder="Note for the log (optional)" maxLength={500} onChange={(e) => setReason(e.target.value)} />
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!data || pending || !changed} onClick={save}>
          {pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Save
        </Button>
        {saved && <p role="status" className="text-sm text-muted-foreground">Saved.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}

// One name: its books, and Rename.
const AuthorEditor = ({ name, onBack, onDone }: { name: string, onBack: () => void, onDone: (message: string, name: string | null) => void }) => {
  const { data: works, error } = useSWR<AuthorWork[]>(`/api/staff/authors?name=${encodeURIComponent(name)}`, fetcher)
  const [to, setTo] = useState(name)
  const [reviewing, setReviewing] = useState(false)
  useEffect(() => { setTo(name); setReviewing(false) }, [name])
  const trimmed = to.replace(/\s+/g, ' ').trim()

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm text-muted-foreground hover:text-foreground">← Back to results</button>
      <div>
        <h2 className="text-lg font-semibold">{name}</h2>
        <Link href={authorHref(name)} className="text-sm text-brand-text hover:underline">Author page</Link>
      </div>

      <section className={`${cardClass} flex flex-col gap-3`}>
        <h3 className="font-medium">Rename</h3>
        <p className="text-sm text-muted-foreground">Changes the name on every book that has it, and on readers&rsquo; copies still showing it.</p>
        <ClearableInput className={fieldClass} value={to} maxLength={200} aria-label="New name"
          onChange={(e) => { setTo(e.target.value); setReviewing(false) }} />
        {reviewing
          ? <ConfirmChange change={{ kind: 'rename', from: name, to: trimmed }} onCancel={() => setReviewing(false)} onDone={(r) => onDone(resultLine(r), trimmed)} />
          : <Button size="sm" className="self-start" disabled={!trimmed || trimmed === name} onClick={() => setReviewing(true)}>Review rename</Button>}
      </section>

      <ProfileEditor name={name} />

      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {!works && !error &&<Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {works && (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">{counted(works.length, 'book', 'books')}{works.length === 200 && ' (the first 200)'}</h3>
          <ul className="flex flex-col gap-2">
            {works.map((w) => (
              <li key={w.id}>
                <Link href={`/staff/catalogue?work=${w.id}`} className={`${cardClass} flex items-center gap-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-900`}>
                  {w.coverUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={w.coverUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                    : <span className="h-14 w-10 shrink-0 rounded bg-neutral-200 dark:bg-neutral-800" aria-hidden />}
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{w.title}</span>
                    <span className="block text-sm text-muted-foreground truncate">
                      {w.authors.join(', ')}{w.authorKeys.length > 0 && ` · ${w.authorKeys.join(', ')}`}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {counted(w._count.books, "reader's copy", "readers' copies")}{w.seriesName && ` · ${w.seriesName}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// Two or more spellings into one name, and one Open Library key.
const MergeAuthors = ({ names, onBack, onDone }: { names: AuthorHit[], onBack: () => void, onDone: (message: string, name: string | null) => void }) => {
  // The spelling with the most books is usually the right one.
  const [to, setTo] = useState(() => names.slice().sort((a, b) => b.books - a.books)[0].name)
  const keys = Array.from(new Set(names.flatMap((n) => n.keys)))
  const [key, setKey] = useState<string>(keys[0] ?? '')
  const [reviewing, setReviewing] = useState(false)
  const trimmed = to.replace(/\s+/g, ' ').trim()
  const change: Change = { kind: 'merge', names: names.map((n) => n.name), keys, to: trimmed, key: key || null }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm text-muted-foreground hover:text-foreground">← Back to results</button>
      <h2 className="text-lg font-semibold">Merge {names.length} names</h2>
      <section className={`${cardClass} flex flex-col gap-3`}>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium mb-1">Name to keep</legend>
          {names.map((n) => (
            <label key={n.name} className="flex min-h-11 items-center gap-3 cursor-pointer">
              <input type="radio" name="merge-name" className="size-4 accent-brand" checked={to === n.name} onChange={() => { setTo(n.name); setReviewing(false) }} />
              <span>{n.name} <span className="text-sm text-muted-foreground">({counted(n.books, 'book', 'books')})</span></span>
            </label>
          ))}
          <ClearableInput className={fieldClass} value={to} maxLength={200} aria-label="Or type the name"
            onChange={(e) => { setTo(e.target.value); setReviewing(false) }} />
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Open Library author</span>
          <select className={`${fieldClass} h-11 pointer-fine:h-9 py-0`} value={key} onChange={(e) => { setKey(e.target.value); setReviewing(false) }}>
            {keys.map((k) => <option key={k} value={k}>{k}</option>)}
            <option value="">None</option>
          </select>
          <span className="text-sm text-muted-foreground">
            The author page finds books by this id. The others are swapped for it on every book being merged
            {keys.length > 0 && <>, and their followers follow it instead</>}.
          </span>
        </label>
        {reviewing
          ? <ConfirmChange change={change} onCancel={() => setReviewing(false)} onDone={(r) => onDone(resultLine(r), trimmed)} />
          : <Button size="sm" className="self-start" disabled={!trimmed} onClick={() => setReviewing(true)}>Review merge</Button>}
      </section>
    </div>
  )
}

// The confirm step: what it will change, a reason for the log (required), then the change itself.
const ConfirmChange = ({ change, onCancel, onDone }: { change: Change, onCancel: () => void, onDone: (r: AuthorChangeResult) => void }) => {
  const [count, setCount] = useState<AuthorChangeCount | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    staffSend<AuthorChangeCount>('/api/staff/authors', 'POST', change)
      .then((c) => live && setCount(c), (err: Error) => live && setError(err.message))
    return () => { live = false }
    // The change is rebuilt each render; its JSON is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(change)])

  const confirm = async () => {
    setPending(true)
    setError(null)
    try {
      onDone(await staffSend<AuthorChangeResult>('/api/staff/authors', 'POST', { ...change, confirm: true, reason }))
    } catch (err) {
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-accent/50 p-3">
      {!count && !error && <Loader2 className="animate-spin text-muted-foreground" aria-label="Counting" />}
      {count && <p className="font-medium">This changes {counted(count.books, 'book', 'books')} and {counted(count.copies, "reader's copy", "readers' copies")}.</p>}
      <ClearableInput className={fieldClass} placeholder="Why (for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-label="Reason" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={confirm} disabled={pending || !count || !reason.trim()}>
          {pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}{change.kind === 'rename' ? 'Rename' : 'Merge'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
      </div>
    </div>
  )
}

export default StaffAuthors
