"use client"
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import useSWRInfinite from 'swr/infinite'
import { Loader2 } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { StaffLogEntry } from '@/lib/staffLog'
import { Button } from '../ui/button'
import { cardClass } from './staffApi'

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// What changed, in a line: the before and after values the staff libs log, minus bookkeeping.
function detail(entry: StaffLogEntry) {
  const show = (v: unknown) => (v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>)
    .filter(([k]) => k !== 'copies' && k !== 'reports')
    .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join(', ')
      : typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val) ? (val.startsWith('9999') ? 'no end date' : when(val))
      : typeof val === 'string' && val.length > 80 ? `${val.slice(0, 80)}…` : String(val)}`)
    .join('; ') : '')
  const before = show(entry.before)
  const after = show(entry.after)
  return [before && `was ${before}`, after && `now ${after}`].filter(Boolean).join(' → ')
}

function targetLink(entry: StaffLogEntry) {
  if (entry.targetType === 'user') return { href: `/staff/users?q=${entry.targetId}`, label: entry.targetName ? `@${entry.targetName}` : 'an account' }
  if (entry.targetType === 'work') return { href: `/staff/catalogue?work=${entry.targetId}`, label: 'a book' }
  if (entry.targetType === 'list') return { href: `/lists/${entry.targetId}`, label: 'a list' }
  return null
}

const StaffLog = () => {
  const target = useSearchParams()?.get('target') ?? null
  const { data, size, setSize, isLoading, error } = useSWRInfinite<StaffLogEntry[]>((index, previous: StaffLogEntry[] | null) => {
    if (previous && previous.length === 0) return null
    const params = new URLSearchParams()
    if (target) params.set('target', target)
    if (index > 0 && previous) params.set('before', previous[previous.length - 1].createdAt)
    return `/api/staff/log?${params}`
  }, fetcher)
  const entries = data?.flat() ?? []
  const done = data && data[data.length - 1]?.length < 50

  return (
    <div className="flex flex-col gap-3">
      {target && <p className="text-sm text-muted-foreground">Showing one account or book. <Link href="/staff/log" className="text-brand-text hover:underline">Show everything</Link></p>}
      {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && entries.length === 0 && <p className="text-muted-foreground">Nothing has been changed through the staff tools yet.</p>}
      <ol className="flex flex-col gap-2">
        {entries.map((e) => {
          const link = targetLink(e)
          const line = detail(e)
          return (
            <li key={e.id} className={`${cardClass} text-sm`}>
              <p>
                <span className="font-medium">@{e.actor}</span> {e.label.toLowerCase()}
                {link && <> · <Link href={link.href} className="text-brand-text hover:underline">{link.label}</Link></>}
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
