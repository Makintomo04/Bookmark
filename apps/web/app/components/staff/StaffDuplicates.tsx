"use client"
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { DuplicatesPage, DuplicateWork } from '@/lib/catalogueMerge'
import type { StaffWork } from '@/lib/catalogueFix'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { Cover, counted, keptBothLine } from './StaffCatalogue'
import { cardClass, fieldClass, staffSend } from './staffApi'

// Books filed in the catalogue more than once (lib/catalogueMerge.ts duplicatesPage), in pairs: the likeliest
// keeper first. Merging moves everything on one onto the other, and can be undone from the kept book's history.
const StaffDuplicates = () => {
  const [page, setPage] = useState(0)
  const { data, error, isLoading } = useSWR<DuplicatesPage>(`/api/staff/works/duplicates?page=${page}`, fetcher, { keepPreviousData: true })
  // Books merged away on this visit, so their pairs drop out without a reload.
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [merged, setMerged] = useState<{ title: string, id: string, keptBoth: number } | null>(null)

  const pairs = data?.pairs.filter(([a, b]) => !gone.has(a.id) && !gone.has(b.id)) ?? []
  // Each merge settles one book filed twice, until the next load counts again.
  const total = data ? Math.max(0, data.total - gone.size) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Possible duplicates</h2>
        <p className="text-sm text-muted-foreground">Books filed more than once under the same title and first author. Check they really are one book (not a different translation or a box set) before merging. A merge can be undone from the kept book&apos;s history.</p>
      </div>
      {merged && (
        <p role="status" className="text-sm text-muted-foreground">
          Merged.{keptBothLine(merged.keptBoth)}{' '}<Link href={`/staff/catalogue?work=${merged.id}`} className="text-brand-text hover:underline">Open {merged.title}</Link>
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {isLoading && !data && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {data && total === 0 && <p className="text-muted-foreground">No likely duplicates. Nice.</p>}
      {data && total > 0 && <p className="text-sm text-muted-foreground">{counted(total, 'book', 'books')} filed more than once.</p>}
      <ul className="flex flex-col gap-3">
        {pairs.map(([a, b]) => (
          <DuplicatePair key={`${a.id}:${b.id}`} pair={[a, b]} onMerged={(dup, into, keptBoth) => {
            setGone((g) => new Set(g).add(dup.id))
            setMerged({ title: into.title, id: into.id, keptBoth })
          }} />
        ))}
      </ul>
      {data && (page > 0 || data.more) && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page === 0 || isLoading}>Previous</Button>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={!data.more || isLoading}>Next</Button>
        </div>
      )}
    </div>
  )
}

const DuplicatePair = ({ pair, onMerged }: { pair: [DuplicateWork, DuplicateWork], onMerged: (duplicate: DuplicateWork, into: DuplicateWork, keptBoth: number) => void }) => {
  // The side being kept, while confirming.
  const [into, setInto] = useState<0 | 1 | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const merge = async () => {
    if (into === null) return
    const keep = pair[into]
    const duplicate = pair[into === 0 ? 1 : 0]
    setPending(true)
    setError(null)
    try {
      const saved = await staffSend<{ work: StaffWork, moved: { keptBoth: number } }>(`/api/staff/works/${duplicate.id}/merge`, 'POST', { intoId: keep.id, reason })
      onMerged(duplicate, keep, saved.moved.keptBoth)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <li className={`${cardClass} flex flex-col gap-3`}>
      <div className="grid gap-3 sm:grid-cols-2">
        {pair.map((w, i) => (
          <div key={w.id} className={`flex gap-3 rounded-md p-2 ${into === i ? 'bg-neutral-100 dark:bg-neutral-900' : ''}`}>
            <Cover url={w.coverUrl} className="h-24 w-16" />
            <div className="min-w-0 flex flex-col gap-1 text-sm">
              <Link href={`/staff/catalogue?work=${w.id}`} className="font-medium hover:underline break-words">{w.title}</Link>
              <span className="text-muted-foreground break-words">{w.authors.join(', ') || 'No author'}{w.firstPublishYear ? ` · ${w.firstPublishYear}` : ''}</span>
              <span className="text-xs text-muted-foreground">
                {w._count.books} on shelves · {counted(w._count.editions, 'edition', 'editions')} · {w.openLibraryKey ?? (w.hardcoverId ? 'Hardcover' : 'hand-typed')}
              </span>
              {into === null && (
                <Button size="sm" variant="outline" className="mt-1 self-start" onClick={() => { setInto(i as 0 | 1); setError(null) }}>Merge into this one</Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {into !== null && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Merge <span className="font-medium">{pair[into === 0 ? 1 : 0].title}</span> into <span className="font-medium">{pair[into].title}</span>? Its editions, readers&apos; copies, list entries, reading circles, tags and reports move across. Readers with both keep one copy, or both if each holds something the other would lose.
          </p>
          <ClearableInput className={fieldClass} placeholder="Why they're the same book (kept in the staff log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div className="flex gap-2">
            <Button size="sm" onClick={merge} disabled={pending || !reason.trim()}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Merge</Button>
            <Button size="sm" variant="ghost" onClick={() => { setInto(null); setError(null) }} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
      {error && <p role="status" className="text-sm text-destructive">{error}</p>}
    </li>
  )
}

export default StaffDuplicates
