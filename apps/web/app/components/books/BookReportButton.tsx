"use client"
import { FC, FormEvent, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Flag } from 'lucide-react'
import { apiError } from '@/lib/notify'
import { BOOK_ISSUES, BOOK_REPORT_NOTE_MAX, type BookIssue } from '@/lib/bookReportRules'
import { withCallback } from '@/lib/callbackUrl'
import useUser from '@/app/hooks/useUser'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'

const linkClass = "inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

// A book page's "Report missing or incorrect information": tick what's wrong, optionally say how, send.
// Opens in place under the details it's about. Signed out, it's a link to sign in and come back.
const BookReportButton: FC<{ workKey: string, path: string }> = ({ workKey, path }) => {
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [issues, setIssues] = useState<BookIssue[]>([])
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)

  if (sent) {
    return <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Flag size={14} aria-hidden />Thanks. We&apos;ll take a look and put it right.</p>
  }

  if (!user?.id) {
    return (
      <Link href={withCallback("/signin", path)} className={linkClass}>
        <Flag size={14} aria-hidden />Sign in to report missing or incorrect information
      </Link>
    )
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className={linkClass}>
        <Flag size={14} aria-hidden />Report missing or incorrect information
      </button>
    )
  }

  const toggle = (issue: BookIssue) =>
    setIssues((current) => (current.includes(issue) ? current.filter((i) => i !== issue) : [...current, issue]))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (issues.length === 0) return setError("Choose what's wrong.")
    if (issues.includes("other") && !note.trim()) return setError("Tell us what's wrong.")
    setError(null)
    setIsSending(true)
    axios.post("/api/books/report", { workKey, issues, note: note.trim() || undefined })
      .then(() => setSent(true))
      .catch((err) => setError(apiError(err, "Couldn't send your report. Try again.")))
      .finally(() => setIsSending(false))
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <fieldset>
        <legend className="text-sm font-medium">What&apos;s missing or wrong?</legend>
        <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {BOOK_ISSUES.map((issue) => (
            <label key={issue.value} className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={issues.includes(issue.value)} onChange={() => toggle(issue.value)} disabled={isSending} className="size-4 accent-brand" />
              {issue.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm">
        <span>
          What should it say?{" "}
          <span className="text-muted-foreground">{issues.includes("other") ? "(needed for “Something else”)" : "(optional)"}</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={BOOK_REPORT_NOTE_MAX}
          rows={3}
          disabled={isSending}
          placeholder="e.g. It's 498 pages, and it's book 1 of The Empyrean."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={isSending} className={secondaryButtonClass}>{isSending ? "Sending…" : "Send report"}</button>
        <button type="button" onClick={() => { setOpen(false); setError(null) }} disabled={isSending} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default BookReportButton
