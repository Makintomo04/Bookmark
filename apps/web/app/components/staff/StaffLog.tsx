"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWRInfinite from 'swr/infinite'
import { Loader2 } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { StaffLogEntry } from '@/lib/staffLog'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass } from './staffApi'

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// What changed, in a line: the before and after values the staff libs log, minus bookkeeping.
function detail(entry: StaffLogEntry) {
  const show = (v: unknown) => (v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>)
    .filter(([k]) => k !== 'copies' && k !== 'reports' && k !== 'reverts')
    .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join(', ')
      : typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val) ? (val.startsWith('9999') ? 'no end date' : when(val))
      : typeof val === 'string' && val.length > 80 ? `${val.slice(0, 80)}…` : String(val)}`)
    .join('; ') : '')
  const before = show(entry.before)
  const after = show(entry.after)
  return [before && `was ${before}`, after && `now ${after}`].filter(Boolean).join(' → ')
}

// What each kind of target is called when its name couldn't be found (deleted, say).
const FALLBACK: Record<string, string> = {
  user: 'an account', work: 'a book', edition: 'an edition', list: 'a list', review: 'a review', comment: 'a circle comment', report: 'a report',
}

const FILTERS = ['actor', 'action', 'from', 'to'] as const
type Filters = Record<(typeof FILTERS)[number], string>

const selectClass = 'h-11 pointer-fine:h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

// Admins ("staff.log") see everything and can filter by who did it. Librarians ("log.own") see their own
// changes, and a book's whole history from its link here or in the catalogue (lib/staffLog.ts).
const StaffLog = ({ everything, actions }: { everything: boolean, actions: { value: string, label: string }[] }) => {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname() ?? '/staff/log'
  const target = params?.get('target') ?? null
  const applied: Filters = { actor: params?.get('actor') ?? '', action: params?.get('action') ?? '', from: params?.get('from') ?? '', to: params?.get('to') ?? '' }
  const [form, setForm] = useState<Filters>(applied)
  const appliedKey = FILTERS.map((k) => applied[k]).join('|')
  // Back and forward change the URL; the form follows it.
  useEffect(() => {
    setForm({ actor: params?.get('actor') ?? '', action: params?.get('action') ?? '', from: params?.get('from') ?? '', to: params?.get('to') ?? '' })
  }, [appliedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, size, setSize, isLoading, error } = useSWRInfinite<StaffLogEntry[]>((index, previous: StaffLogEntry[] | null) => {
    if (previous && previous.length === 0) return null
    const query = new URLSearchParams()
    if (target) query.set('target', target)
    for (const k of FILTERS) if (applied[k]) query.set(k, applied[k])
    if (index > 0 && previous) query.set('before', previous[previous.length - 1].createdAt)
    return `/api/staff/log?${query}`
  }, fetcher)
  const entries = data?.flat() ?? []
  const done = data && data[data.length - 1]?.length < 50
  const filtered = FILTERS.some((k) => applied[k])

  const apply = (next: Filters) => {
    const query = new URLSearchParams()
    if (target) query.set('target', target)
    for (const k of FILTERS) if (next[k].trim()) query.set(k, next[k].trim())
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false })
  }
  const clear = () => {
    const empty = { actor: '', action: '', from: '', to: '' }
    setForm(empty)
    apply(empty)
  }

  return (
    <div className="flex flex-col gap-3">
      {!everything && !target && <p className="text-sm text-muted-foreground">Your own changes. A book&apos;s full history, whoever made the changes, is in its editor in the catalogue.</p>}
      {target && <p className="text-sm text-muted-foreground">Showing one {everything ? 'account or book' : 'book'}. <Link href="/staff/log" className="text-brand-text hover:underline">{everything ? 'Show everything' : 'Show your own changes'}</Link></p>}

      <form className={`${cardClass} grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] items-end`} onSubmit={(e) => { e.preventDefault(); apply(form) }}>
        {everything && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Who
            <ClearableInput className={fieldClass} placeholder="Username" value={form.actor} autoCapitalize="none" spellCheck={false}
              onChange={(e) => setForm({ ...form, actor: e.target.value })} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          What
          <select className={selectClass} value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
            <option value="">Anything</option>
            {actions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          From
          <input type="date" className={`${fieldClass} h-11 pointer-fine:h-9`} value={form.from} max={form.to || undefined} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          To
          <input type="date" className={`${fieldClass} h-11 pointer-fine:h-9`} value={form.to} min={form.from || undefined} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </label>
        <div className="flex gap-2">
          <Button size="sm" type="submit">Filter</Button>
          {filtered && <Button size="sm" variant="ghost" type="button" onClick={clear}>Clear</Button>}
        </div>
      </form>

      {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && entries.length === 0 && (
        <p className="text-muted-foreground">{filtered ? 'Nothing matches those filters.' : everything ? 'Nothing has been changed through the staff tools yet.' : 'You haven’t changed anything through the staff tools yet.'}</p>
      )}
      <ol className="flex flex-col gap-2">
        {entries.map((e) => {
          const label = e.targetName ?? FALLBACK[e.targetType] ?? null
          const line = detail(e)
          return (
            <li key={e.id} className={`${cardClass} text-sm`}>
              <p>
                <span className="font-medium">@{e.actor}</span> {e.label.toLowerCase()}
                {label && <> · {e.targetPath ? <Link href={e.targetPath} className="text-brand-text hover:underline">{label}</Link> : label}</>}
                <span className="text-muted-foreground"> · {when(e.createdAt)}</span>
              </p>
              {line && <p className="mt-1 text-muted-foreground break-words">{line}</p>}
              {e.reason && <p className="mt-1">“{e.reason}”</p>}
            </li>
          )
        })}
      </ol>
      {entries.length > 0 && !done && <Button variant="outline" size="sm" className="self-start" onClick={() => setSize(size + 1)}>Older</Button>}
    </div>
  )
}

export default StaffLog
