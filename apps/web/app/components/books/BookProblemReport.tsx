"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import useUser from '@/app/hooks/useUser'
import { can } from '@/lib/roles'
import { Button } from '../ui/button'

// Matches BOOK_REPORT_REASONS in lib/staffReports.ts, less "catalogue": asking to add a hand-typed book
// has its own button (catalogueRequest.ts), since a book with a page is already in the catalogue.
const REASONS = [
  { value: 'cover', label: 'Wrong or missing cover' },
  { value: 'details', label: 'Wrong title, author or pages' },
  { value: 'series', label: 'Wrong or missing series' },
  { value: 'other', label: 'Something else' },
] as const

// Under a book's details: readers can report a wrong cover or wrong details for a librarian to fix, and
// librarians get a link straight to the book in the staff catalogue. A book Open Library lacks goes by
// its catalogue Work id.
const BookProblemReport: FC<{ workKey?: string | null, workId?: string | null }> = ({ workKey, workId }) => {
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('cover')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!user) return null

  const send = async () => {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/books/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workId ? { workId, reason, note } : { workKey, reason, note }) })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't send that. Try again.")
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        {!sent && !open && <button type="button" onClick={() => setOpen(true)} className="hover:text-foreground hover:underline underline-offset-2">Report a problem with this book</button>}
        {/* By Open Library key, the catalogue page opens the book's editor itself (staff/catalogue/page.tsx). */}
        {can(user, 'catalogue.edit') && <Link href={workId ? `/staff/catalogue?work=${workId}` : `/staff/catalogue?q=${encodeURIComponent(workKey ?? '')}`} className="inline-flex items-center min-h-11 pointer-fine:min-h-0 text-brand-text hover:underline">Fix this book</Link>}
      </div>
      {sent && <p role="status" className="text-muted-foreground">Thanks. A librarian will take a look.</p>}
      {open && !sent && (
        <form className="mt-3 flex w-full max-w-md flex-col gap-4 rounded-md border border-neutral-200 dark:border-neutral-800 p-4" onSubmit={(e) => { e.preventDefault(); void send() }}>
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">What&apos;s wrong</legend>
            {REASONS.map((r) => (
              <label key={r.value} className="flex min-h-11 pointer-fine:min-h-8 items-center gap-3">
                <input type="radio" name="book-problem" checked={reason === r.value} onChange={() => setReason(r.value)} /> {r.label}
              </label>
            ))}
          </fieldset>
          <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={reason === 'series' ? 'Which series, and which number? (optional)' : 'What should it be? (optional)'}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <div className="flex gap-3">
            <Button size="sm" disabled={pending}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Send report</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {error && <p role="alert" className="text-destructive">{error}</p>}
        </form>
      )}
    </div>
  )
}

export default BookProblemReport
