"use client"
import { useState } from 'react'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { RecentChange } from '@/lib/catalogueUndo'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass } from './staffApi'

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// "Recent changes" under the authors and series tools (lib/catalogueUndo.ts recentChanges): the last ten,
// by anyone, each with Undo. An undo is refused if any of its books has changed since, and the books are
// listed so they can be fixed by hand.
function RecentCatalogueChanges<T>({ url, undoUrl, onUndone }: { url: string, undoUrl: string, onUndone: (result: T) => void }) {
  const { data, error, mutate } = useSWR<RecentChange[]>(url, fetcher)
  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  if (!data) return <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />
  if (!data.length) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">Recent changes</h2>
      <ol className="flex flex-col gap-2">
        {data.map((c) => <ChangeItem key={c.id} change={c} undoUrl={undoUrl} onUndone={(r: T) => { mutate(); onUndone(r) }} />)}
      </ol>
    </section>
  )
}

function ChangeItem<T>({ change, undoUrl, onUndone }: { change: RecentChange, undoUrl: string, onUndone: (result: T) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])

  const undo = async () => {
    setPending(true)
    setError(null)
    setConflicts([])
    try {
      // Not staffSend: a refusal carries the books changed since, as well as the message.
      const res = await fetch(undoUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionId: change.id, reason }) })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "That didn't work. Try again.")
        setConflicts(Array.isArray(data?.conflicts) ? data.conflicts : [])
        return
      }
      setConfirming(false)
      onUndone(data as T)
    } catch {
      setError("That didn't work. Try again.")
    } finally {
      setPending(false)
    }
  }
  const cancel = () => { setConfirming(false); setError(null); setConflicts([]) }

  return (
    <li className={`${cardClass} flex flex-col gap-2 text-sm`}>
      <div>
        <p className="font-medium break-words">{change.summary || change.label}</p>
        <p className="text-muted-foreground">
          {change.summary && `${change.label} · `}@{change.actor} · {when(change.createdAt)} · {counted(change.books, 'book', 'books')}
        </p>
      </div>
      {change.reason && <p className="break-words">“{change.reason}”</p>}
      {change.undone ? (
        <p className="text-muted-foreground">Undone since.</p>
      ) : change.isUndo ? null : confirming ? (
        <div className="flex flex-col gap-2 rounded-md bg-accent/50 p-3">
          <p>Puts {counted(change.books, 'book', 'books')} back as they were, with readers&rsquo; copies and follows.</p>
          <ClearableInput className={fieldClass} placeholder="Why it's being undone (for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-label="Reason" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={undo} disabled={pending || !reason.trim()}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Undo change</Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={pending}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setConfirming(true)}>Undo</Button>
      )}
      {error && (
        <div role="status" className="text-destructive">
          <p>{error}</p>
          {conflicts.length > 0 && <ul className="mt-1 list-disc pl-5">{conflicts.map((t, i) => <li key={i} className="break-words">{t}</li>)}</ul>}
        </div>
      )}
    </li>
  )
}

export default RecentCatalogueChanges
