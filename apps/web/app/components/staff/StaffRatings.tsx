"use client"
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { cn } from '@/lib/utils'
import type { HeldEntry, SpikeEntry } from '@/lib/ratingSpikes'
import { NEW_ACCOUNT_DAYS, SPIKE_WINDOW_DAYS, type SpikeAction } from '@/lib/ratingSpikeRules'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass, formatDate, staffSend } from './staffApi'

type View = 'bursts' | 'held'

// Bursts of extreme ratings from new accounts, and the ratings staff have held out of the average.
const StaffRatings = () => {
  const [view, setView] = useState<View>('bursts')
  const { data, error, isLoading, mutate } = useSWR<(SpikeEntry | HeldEntry)[]>(`/api/staff/ratings${view === 'held' ? '?view=held' : ''}`, fetcher)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Books that got several one-star or five-star ratings, all the same way, from accounts under {NEW_ACCOUNT_DAYS} days old in the last {SPIKE_WINDOW_DAYS} days.
        Holding takes those ratings out of the average and the &ldquo;people you follow&rdquo; signals. Reviews and readers&apos; own shelves are untouched.
      </p>
      <div className="flex gap-2" role="tablist" aria-label="Which ratings">
        {(['bursts', 'held'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={cn('inline-flex h-11 pointer-fine:h-9 items-center rounded-full px-4 text-sm font-medium transition',
              view === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900')}>
            {v === 'bursts' ? 'Bursts' : 'Held'}
          </button>
        ))}
      </div>
      {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && data.length === 0 && <p className="text-muted-foreground">{view === 'bursts' ? 'No unusual bursts of ratings.' : 'No ratings are being held.'}</p>}
      {data?.map((entry) => <Card key={entry.workId} entry={entry} onDone={() => mutate()} />)}
    </div>
  )
}

const isBurst = (e: SpikeEntry | HeldEntry): e is SpikeEntry => 'side' in e

const Card = ({ entry, onDone }: { entry: SpikeEntry | HeldEntry, onDone: () => void }) => {
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<SpikeAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const act = async (action: SpikeAction) => {
    setPending(action)
    setError(null)
    try {
      await staffSend(`/api/staff/ratings/${entry.workId}`, 'POST', { action, note })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(null)
    }
  }
  const button = (action: SpikeAction, label: string, variant: 'outline' | 'destructive' = 'outline') => (
    <Button size="sm" variant={variant} disabled={!!pending} onClick={() => act(action)}>
      {pending === action && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}{label}
    </Button>
  )

  return (
    <article className={cardClass}>
      <h2 className="font-semibold">{entry.path ? <Link href={entry.path} className="hover:underline underline-offset-2">{entry.title}</Link> : entry.title}</h2>
      {isBurst(entry) ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {entry.count} {entry.side === 'low' ? 'one-star' : 'five-star'} ratings from new accounts, {formatDate(entry.firstAt)} to {formatDate(entry.lastAt)},
          out of {entry.windowTotal} this week. Average {entry.average ?? 'none'}, or {entry.averageWithout ?? 'none'} without them.
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          {entry.held} {entry.held === 1 ? 'rating' : 'ratings'} held by {entry.heldBy ? `@${entry.heldBy}` : 'a former member of staff'} on {formatDate(entry.heldAt)}{entry.note ? `: ${entry.note}` : ''}.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        <label className="sr-only" htmlFor={`note-${entry.workId}`}>Note for the log</label>
        <ClearableInput id={`note-${entry.workId}`} className={fieldClass} placeholder="Note for the log (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <div className="flex flex-wrap gap-2">
          {isBurst(entry)
            ? <>{button('hold', 'Hold these ratings', 'destructive')}{button('dismiss', 'Looks genuine')}</>
            : button('release', 'Put the ratings back')}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </article>
  )
}

export default StaffRatings
