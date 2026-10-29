"use client"
import { useState } from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig } from 'swr'
import { Loader2, Lock } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { cn } from '@/lib/utils'
import type { CommentThread as Thread, QueueEntry, ReportAction, ReportTrail } from '@/lib/staffReports'
import { canPutBack, mayReverseTakedown, reportOutcome, takedownLockReason, timeAgo, trackRecordLine, type ReportView } from '@/lib/staffReportRules'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass, formatDate, staffSend } from './staffApi'
import { STAFF_COUNTS_URL, useStaffCounts } from './staffCounts'

const KIND_LABELS: Record<QueueEntry['kind'], string> = { list: 'List', comment: 'Comment', review: 'Review', book: 'Book details' }
const VIEW_LABELS: Record<ReportView, string> = { open: 'Open', escalated: 'Escalated', closed: 'Closed' }
const EMPTY: Record<ReportView, string> = {
  open: 'Nothing waiting. Every report has been looked at.',
  escalated: 'Nothing escalated.',
  closed: 'No closed reports yet.',
}

// What the second tap confirms, for the actions that take something down or close it unseen.
const CONFIRM: Partial<Record<ReportAction, (kind: QueueEntry['kind']) => [question: string, yes: string]>> = {
  hide: (kind) => kind === 'list' ? ['Hide this list?', 'Hide it'] : kind === 'comment' ? ['Remove this comment for everyone?', 'Remove it'] : ['Hide this review?', 'Hide it'],
  hide_rating: () => ['Hide this review and its rating?', 'Hide both'],
  dismiss: () => ['Close without doing anything?', 'Dismiss'],
}

// The reports queue: one card per reported thing, the most reported first. Escalated items have their own
// tab; only admins can act on them.
const StaffReports = ({ canSuspend, initialView = 'open' }: { canSuspend: boolean, initialView?: ReportView }) => {
  const [view, setView] = useState<ReportView>(initialView)
  const { data, error, isLoading, mutate } = useSWR<QueueEntry[]>(`/api/staff/reports?view=${view}`, fetcher)
  const { data: counts } = useStaffCounts()
  const { mutate: refresh } = useSWRConfig()
  const tabCount = (v: ReportView) => v === 'open' ? counts?.openTotal : v === 'escalated' ? counts?.escalated : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Which reports">
        {(['open', 'escalated', 'closed'] as const).map((v) => {
          const count = tabCount(v)
          return (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn('inline-flex h-11 pointer-fine:h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition',
                view === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900')}>
              {VIEW_LABELS[v]}
              {count !== undefined && <span className={cn('tabular-nums', view === v ? 'opacity-70' : 'text-muted-foreground')}>{count}</span>}
            </button>
          )
        })}
      </div>

      {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && data.length === 0 && <p className="text-muted-foreground">{EMPTY[view]}</p>}
      {data?.map((entry) => (
        <ReportCard key={`${entry.kind}:${entry.itemId}`} entry={entry} canSuspend={canSuspend} closed={view === 'closed'}
          onDone={() => { mutate(); refresh(STAFF_COUNTS_URL) }} />
      ))}
    </div>
  )
}

const Who = ({ trail }: { trail: ReportTrail }) => (
  <>{trail.by ? `@${trail.by}` : 'someone'}{trail.at && <time dateTime={trail.at} title={formatDate(trail.at)}>, {timeAgo(trail.at)}</time>}</>
)

// Long excerpts start clamped to four lines.
const Excerpt = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false)
  const long = text.length > 280 || text.split('\n').length > 4
  return (
    <div className="mt-1">
      <p className={cn('text-sm text-muted-foreground whitespace-pre-line', !open && 'line-clamp-4')}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="mt-1 -mx-1 px-1 py-2 pointer-fine:py-0.5 text-sm font-medium text-brand-text hover:underline">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

// A reported circle comment with what's around it: the parent, a couple before, one after. Circles are
// members-only, so this is where staff read it in context. Anything further into the book stays locked.
const CommentThread = ({ commentId }: { commentId: string }) => {
  const { data, error } = useSWR<Thread>(`/api/staff/reports/comment/${commentId}`, fetcher)
  if (error) return <p className="mt-2 text-sm text-destructive">{error.message}</p>
  if (!data) return <Loader2 className="mt-2 animate-spin text-muted-foreground" size={16} aria-label="Loading the thread" />
  return (
    <section className="mt-3" aria-label="The comment in its thread">
      <p className="text-xs text-muted-foreground">In the circle for {data.circleTitle}</p>
      <ol className="mt-2 flex flex-col gap-2">
        {data.comments.map((c) => {
          const where = c.pageLabel ? `p. ${c.pageLabel}` : c.chapterLabel ?? `${Math.round(c.position)}%`
          return (
            <li key={c.id} id={c.reported ? `comment-${c.id}` : undefined}
              className={cn('rounded-md px-3 py-2 text-sm', c.isReply && 'ml-4 sm:ml-6',
                c.reported ? 'border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40' : 'bg-neutral-50 dark:bg-neutral-900')}>
              {c.locked ? (
                <p className="flex items-center gap-1.5 text-muted-foreground"><Lock size={14} aria-hidden />Further into the book ({Math.round(c.position)}%), so it stays hidden.</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {c.authorUsername ? `@${c.authorUsername}` : 'A deleted account'} · {where}{c.reported && <span className="font-medium text-foreground"> · Reported</span>}
                  </p>
                  {c.deleted ? <p className="mt-0.5 italic text-muted-foreground">Removed</p> : <p className="mt-0.5 whitespace-pre-line line-clamp-6">{c.body}</p>}
                </>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

const ReportCard = ({ entry, canSuspend, closed, onDone }: { entry: QueueEntry, canSuspend: boolean, closed: boolean, onDone: () => void }) => {
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<ReportAction | 'unhide' | null>(null)
  const [confirming, setConfirming] = useState<ReportAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const escalated = entry.status === 'ESCALATED'
  // The server says the same: an escalated item is the admins'.
  const readOnly = escalated && !canSuspend
  const outcome = reportOutcome(entry.kind, entry.status)
  // The server checks the same. canSuspend stands in for the viewer: everyone here can review reports.
  const viewer = { role: canSuspend ? 'ADMIN' : 'LIBRARIAN' }
  const mayPutBack = mayReverseTakedown(viewer, entry.takedown)

  const act = async (action: ReportAction | 'unhide') => {
    setPending(action)
    setError(null)
    try {
      await staffSend(`/api/staff/reports/${entry.kind}/${entry.itemId}`, 'POST', { action, note })
      setConfirming(null)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(null)
    }
  }

  // Destructive actions ask once more, in place of the buttons.
  const button = (action: ReportAction, label: string, variant: 'default' | 'outline' | 'destructive' = 'outline') => (
    <Button size="sm" variant={variant} disabled={!!pending} onClick={() => CONFIRM[action] ? setConfirming(action) : act(action)}>
      {pending === action && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}{label}
    </Button>
  )
  const confirmation = confirming && CONFIRM[confirming]?.(entry.kind)

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5">{KIND_LABELS[entry.kind]}</span>
        {escalated && <span className="rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 px-2 py-0.5">{canSuspend ? 'Escalated to you' : 'Waiting for an admin'}</span>}
        {outcome && <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5">{outcome}</span>}
        {entry.removed && !closed && <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-muted-foreground">Already taken down</span>}
        <span className="text-muted-foreground">
          {entry.reportCount} {entry.reportCount === 1 ? 'report' : 'reports'}, last {formatDate(entry.lastReportedAt)}
        </span>
      </div>

      <h2 className="mt-3 font-semibold">
        {entry.path ? <Link href={entry.path} className="hover:underline underline-offset-2">{entry.title}</Link> : entry.title}
      </h2>
      {entry.kind === 'comment' ? <CommentThread commentId={entry.itemId} /> : entry.excerpt && <Excerpt text={entry.excerpt} />}
      {entry.editions.length > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          {entry.editions.length === 1 ? 'Edition' : 'Editions'}: {entry.editions.join('; ')}
        </p>
      )}
      {entry.authorId && (
        <p className="mt-2 text-sm">
          By {entry.authorUsername
            ? <Link href={`/staff/users?q=${entry.authorId}`} className="text-brand-text hover:underline">@{entry.authorUsername}</Link>
            : <span className="text-muted-foreground">a deleted account</span>}
          {entry.trackRecord && (
            <span className="text-muted-foreground"> · {trackRecordLine(entry.trackRecord, { actioned: entry.status === 'ACTIONED' && entry.removed }, entry.authorUsername)}</span>
          )}
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

      {/* The hand-off, and on closed cards the decision. */}
      {(entry.escalation || entry.resolution) && (
        <div className="mt-3 flex flex-col gap-1 rounded-md bg-neutral-50 dark:bg-neutral-900 px-3 py-2 text-sm">
          {entry.escalation && (
            <p>Escalated by <Who trail={entry.escalation} />{entry.escalation.note ? <>: <span className="text-muted-foreground">{entry.escalation.note}</span></> : null}</p>
          )}
          {entry.resolution && (
            <p>{outcome ?? 'Closed'} by <Who trail={entry.resolution} />{entry.resolution.note ? <>: <span className="text-muted-foreground">{entry.resolution.note}</span></> : null}</p>
          )}
        </div>
      )}

      {closed && canPutBack(entry) && !mayPutBack && (
        <p className="mt-4 text-sm text-muted-foreground">{takedownLockReason(entry.takedown)}</p>
      )}
      {closed && canPutBack(entry) && mayPutBack && (
        <div className="mt-4 flex flex-col gap-3">
          <label className="sr-only" htmlFor={`note-${entry.itemId}`}>Why it's going back up</label>
          <ClearableInput id={`note-${entry.itemId}`} className={fieldClass} placeholder="Why it's going back up (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!!pending} onClick={() => act('unhide')}>
              {pending === 'unhide' && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Put back up
            </Button>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {readOnly && <p className="mt-4 text-sm text-muted-foreground">Waiting for an admin. You'll see it in Closed once they've dealt with it.</p>}

      {!closed && !readOnly && (
        <div className="mt-4 flex flex-col gap-3">
          <label className="sr-only" htmlFor={`note-${entry.itemId}`}>Note for the log</label>
          <ClearableInput id={`note-${entry.itemId}`} className={fieldClass} placeholder={escalated || canSuspend ? 'Note for the log (optional)' : 'Note for the log, or for the admin if you escalate (optional)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          {confirmation ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm">
              <p className="text-sm font-medium mr-1">{confirmation[0]}</p>
              <Button size="sm" variant="destructive" disabled={!!pending} onClick={() => act(confirming!)} autoFocus>
                {pending === confirming && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}{confirmation[1]}
              </Button>
              <Button size="sm" variant="ghost" disabled={!!pending} onClick={() => setConfirming(null)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {entry.kind === 'book' ? (
                <>
                  <Button size="sm" asChild><Link href={`/staff/catalogue?work=${entry.itemId}`}>Fix the book</Link></Button>
                  {button('resolve', 'Mark fixed')}
                </>
              ) : entry.kind === 'review' ? (
                !entry.removed && (
                  <>
                    {button('hide', 'Hide review', 'destructive')}
                    {button('hide_rating', 'Hide review and rating', 'destructive')}
                  </>
                )
              ) : !entry.removed && button('hide', entry.kind === 'list' ? 'Hide list' : 'Remove comment', 'destructive')}
              {button('dismiss', 'Dismiss')}
              {!escalated && !canSuspend && entry.authorId && button('escalate', 'Escalate to an admin')}
              {canSuspend && entry.authorId && (
                <Button size="sm" variant="outline" asChild><Link href={`/staff/users?q=${entry.authorId}`}>Review the author</Link></Button>
              )}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </article>
  )
}

export default StaffReports
