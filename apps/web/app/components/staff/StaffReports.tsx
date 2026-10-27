"use client"
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { cn } from '@/lib/utils'
import type { QueueEntry, ReportAction } from '@/lib/staffReports'
import { Button } from '../ui/button'
import { cardClass, fieldClass, formatDate, staffSend } from './staffApi'

const KIND_LABELS: Record<QueueEntry['kind'], string> = { list: 'List', comment: 'Comment', book: 'Book details' }

// The reports queue: one card per reported thing, escalated first, then the most reported.
const StaffReports = ({ canSuspend }: { canSuspend: boolean }) => {
  const [view, setView] = useState<'queue' | 'closed'>('queue')
  const { data, error, isLoading, mutate } = useSWR<QueueEntry[]>(`/api/staff/reports?view=${view}`, fetcher)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="tablist" aria-label="Which reports">
        {(['queue', 'closed'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={cn('h-9 rounded-full px-4 text-sm font-medium transition',
              view === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900')}>
            {v === 'queue' ? 'Open' : 'Closed'}
          </button>
        ))}
      </div>

      {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && data.length === 0 && (
        <p className="text-muted-foreground">{view === 'queue' ? 'Nothing waiting. Every report has been looked at.' : 'No closed reports yet.'}</p>
      )}
      {data?.map((entry) => (
        <ReportCard key={`${entry.kind}:${entry.itemId}`} entry={entry} canSuspend={canSuspend} closed={view === 'closed'} onDone={() => mutate()} />
      ))}
    </div>
  )
}

const ReportCard = ({ entry, canSuspend, closed, onDone }: { entry: QueueEntry, canSuspend: boolean, closed: boolean, onDone: () => void }) => {
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<ReportAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const act = async (action: ReportAction) => {
    setPending(action)
    setError(null)
    try {
      await staffSend(`/api/staff/reports/${entry.kind}/${entry.itemId}`, 'POST', { action, note })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(null)
    }
  }

  const button = (action: ReportAction, label: string, variant: 'default' | 'outline' | 'destructive' = 'outline') => (
    <Button size="sm" variant={variant} disabled={!!pending} onClick={() => act(action)}>
      {pending === action && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}{label}
    </Button>
  )

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5">{KIND_LABELS[entry.kind]}</span>
        {entry.status === 'ESCALATED' && <span className="rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 px-2 py-0.5">Escalated to an admin</span>}
        {entry.removed && <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-muted-foreground">Already taken down</span>}
        <span className="text-muted-foreground">
          {entry.reportCount} {entry.reportCount === 1 ? 'report' : 'reports'}, last {formatDate(entry.lastReportedAt)}
        </span>
      </div>

      <h2 className="mt-3 font-semibold">
        {entry.path ? <Link href={entry.path} className="hover:underline underline-offset-2">{entry.title}</Link> : entry.title}
      </h2>
      {entry.excerpt && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line line-clamp-4">{entry.excerpt}</p>}
      {entry.authorId && (
        <p className="mt-2 text-sm">
          By {entry.authorUsername
            ? <Link href={`/staff/users?q=${entry.authorId}`} className="text-brand-text hover:underline">@{entry.authorUsername}</Link>
            : <span className="text-muted-foreground">a deleted account</span>}
        </p>
      )}

      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {Object.entries(entry.reasons).map(([reason, count]) => (
          <li key={reason} className="rounded-md border border-neutral-200 dark:border-neutral-800 px-2 py-1">{reason}{count > 1 && ` ×${count}`}</li>
        ))}
      </ul>
      {entry.notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
          {entry.notes.map((n, i) => <li key={i}>“{n}”</li>)}
        </ul>
      )}

      {!closed && (
        <div className="mt-4 flex flex-col gap-3">
          <label className="sr-only" htmlFor={`note-${entry.itemId}`}>Note for the log</label>
          <input id={`note-${entry.itemId}`} className={fieldClass} placeholder="Note for the log (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <div className="flex flex-wrap gap-2">
            {entry.kind === 'book' ? (
              <>
                <Button size="sm" asChild><Link href={`/staff/catalogue?work=${entry.itemId}`}>Fix the book</Link></Button>
                {button('resolve', 'Mark fixed')}
              </>
            ) : !entry.removed && button('hide', entry.kind === 'list' ? 'Hide list' : 'Remove comment', 'destructive')}
            {button('dismiss', 'Dismiss')}
            {entry.status !== 'ESCALATED' && !canSuspend && entry.authorId && button('escalate', 'Escalate to an admin')}
            {canSuspend && entry.authorId && (
              <Button size="sm" variant="outline" asChild><Link href={`/staff/users?q=${entry.authorId}`}>Review the author</Link></Button>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </article>
  )
}

export default StaffReports
