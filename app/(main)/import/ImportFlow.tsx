"use client"
import { FC, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { notify } from '@/lib/notify'
import { BookCheck, CalendarOff, Check, CopyX, ExternalLink, FileUp, HelpCircle, Loader2, Search, Sparkles, Upload } from 'lucide-react'
import type { Status } from '@prisma/client'
import { Button } from '@/app/components/ui/button'
import Medal from '@/app/components/achievements/Medal'
import { cn } from '@/lib/utils'
import type { ImportJobView } from '@/lib/import/job'
import type { UncertainRow } from '@/lib/import/review'
import { SOURCE_LABEL, type FileNotes, type ImportCandidate } from '@/lib/import/types'
import { SearchFailed } from "@/app/components/modals/BookSearchResults";

const MAX_BYTES = 5 * 1024 * 1024

const SHELVES: { status: Status; label: string }[] = [
  { status: "COMPLETED", label: "Finished" },
  { status: "STARTED", label: "Reading" },
  { status: "NOT_STARTED", label: "Want to read" },
  { status: "PAUSED", label: "Paused" },
  { status: "DNF", label: "Did not finish" },
]

const fmt = (n: number) => n.toLocaleString("en-GB")
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`
const FORMAT_LABEL: Record<string, string> = { AUDIOBOOK: "Audiobook", EBOOK: "Ebook", HARDCOVER: "Hardcover", PAPERBACK: "Paperback" }

class StepError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function call(url: string, init?: RequestInit): Promise<ImportJobView | null> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new StepError(body?.error || "Something went wrong. Try again.", res.status)
  return body
}

const step = (id: string, body: Record<string, unknown>) =>
  call(`/api/import/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---- Page --------------------------------------------------------------------------------

const ImportFlow: FC = () => {
  const [job, setJob] = useState<ImportJobView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runId = useRef(0)

  // Repeats one step until the job leaves `while`. Network blips are retried a few times; a 4xx stops.
  const drive = useCallback(async (start: ImportJobView, action: "match" | "import", whileStatus: ImportJobView["status"]) => {
    const run = ++runId.current
    let current = start
    let failures = 0
    setError(null)
    while (current.status === whileStatus && runId.current === run) {
      try {
        const next = await step(current.id, { action })
        if (!next || runId.current !== run) return
        current = next
        failures = 0
        setJob(next)
      } catch (err) {
        const status = err instanceof StepError ? err.status : 0
        if ((status === 0 || status >= 500 || status === 429) && ++failures <= 4) {
          await pause(1500 * failures)
          continue
        }
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.")
        return
      }
    }
  }, [])

  // Pick up an import already under way (a reload, or a second tab).
  useEffect(() => {
    call("/api/import")
      .then((existing) => {
        setJob(existing)
        if (existing?.status === "matching") drive(existing, "match", "matching")
        if (existing?.status === "importing") drive(existing, "import", "importing")
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true))
    return () => { runId.current++ }
  }, [drive])

  const upload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError("That file is over 5 MB. Export just your books as a CSV, not a full data archive.")
      return
    }
    setError(null)
    const form = new FormData()
    form.append("file", file)
    try {
      const created = await call("/api/import", { method: "POST", body: form })
      if (!created) return
      setJob(created)
      if (created.status === "matching") drive(created, "match", "matching")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.")
    }
  }

  const confirm = async () => {
    if (!job) return
    try {
      const started = await step(job.id, { action: "start" })
      if (!started) return
      setJob(started)
      drive(started, "import", "importing")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the import.")
    }
  }

  const startOver = async () => {
    runId.current++
    if (job && job.status !== "done") await call(`/api/import/${job.id}`, { method: "DELETE" }).catch(() => undefined)
    setJob(null)
    setError(null)
  }

  const resume = () => {
    if (job?.status === "matching") drive(job, "match", "matching")
    if (job?.status === "importing") drive(job, "import", "importing")
  }

  if (!loaded) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" /></div>
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 px-4 py-3 text-sm flex flex-wrap items-center gap-3">
          <span className="flex-1 min-w-[12rem]">{error}</span>
          {(job?.status === "matching" || job?.status === "importing") && (
            <Button type="button" size="sm" variant="outline" onClick={resume}>Carry on</Button>
          )}
        </div>
      )}
      {!job || job.status === "cancelled" ? <UploadStep onFile={upload} />
        : job.status === "matching" ? (
          job.checking > 0 && job.looked >= job.total
            ? <ProgressStep title="Checking the unsure ones" detail={`${plural(job.checking, "title")} left to check against Open Library's suggestions`} value={job.total - job.checking} max={job.total} job={job} />
            : <ProgressStep title="Matching your books" detail={`Looking up ${fmt(job.looked)} of ${fmt(job.total)} on Open Library`} value={job.looked} max={job.total} job={job} />
        )
        : job.status === "ready" ? <PreviewStep job={job} onConfirm={confirm} onCancel={startOver} onChange={setJob} />
        : job.status === "importing" ? <ProgressStep title="Adding books to your shelves" detail={`${fmt(Math.min(job.imported, job.total))} of ${fmt(job.total)}`} value={job.imported} max={job.total} />
        : <SummaryStep job={job} onChange={setJob} onAnother={startOver} />}
    </div>
  )
}

export default ImportFlow

// ---- Upload ------------------------------------------------------------------------------

const HOW_TO: { source: string; steps: string; href?: string }[] = [
  { source: "Goodreads", steps: "My Books → Import and export → Export library. The CSV arrives a minute or so later.", href: "https://www.goodreads.com/review/import" },
  { source: "StoryGraph", steps: "Your profile → Manage account → Export StoryGraph library.", href: "https://app.thestorygraph.com/user-export" },
  { source: "Bookmark", steps: "An export from Bookmark itself (Edit profile → Export books) imports exactly as it left." },
]

const UploadStep: FC<{ onFile: (file: File) => Promise<void> }> = ({ onFile }) => {
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const take = async (file?: File | null) => {
    if (!file || busy) return
    setBusy(true)
    try { await onFile(file) } finally { setBusy(false) }
  }

  return (
    <>
      <header>
        <h1 className="text-3xl sm:text-4xl font-bold">Bring your library with you</h1>
        <p className="mt-3 text-muted-foreground max-w-prose">
          Bring your shelves, star ratings, reviews and every reading date from Goodreads or StoryGraph.
          You&apos;ll see a preview before anything is added, and your data leaves whenever you do.
        </p>
      </header>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files?.[0]) }}
        className={cn(
          "rounded-xl border-2 border-dashed p-8 sm:p-12 flex flex-col items-center text-center gap-4 transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30"
        )}
      >
        {busy ? <Loader2 size={36} className="animate-spin text-muted-foreground" aria-hidden /> : <FileUp size={36} className="text-muted-foreground" aria-hidden />}
        <div>
          <p className="font-medium">{busy ? "Reading your file…" : "Drop your export here"}</p>
          <p className="text-sm text-muted-foreground">A .csv file, up to 5 MB</p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          id="import-file"
          onChange={(e) => { take(e.target.files?.[0]); e.target.value = "" }}
        />
        <Button type="button" disabled={busy} onClick={() => input.current?.click()} className="gap-2">
          <Upload size={15} aria-hidden /> Choose file
        </Button>
      </div>

      <section aria-labelledby="how-to" className="flex flex-col gap-3">
        <h2 id="how-to" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Where to find your export</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {HOW_TO.map((h) => (
            <li key={h.source} className="rounded-lg border p-4 flex flex-col">
              <p className="font-medium">{h.source}</p>
              <p className="mt-1 text-sm text-muted-foreground">{h.steps}</p>
              {h.href && (
                <Button asChild size="sm" variant="outline" className="mt-3 self-start gap-1.5">
                  <a href={h.href} target="_blank" rel="noopener noreferrer">
                    Open {h.source} export <ExternalLink size={13} aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

// ---- Progress ----------------------------------------------------------------------------

const ProgressBar: FC<{ value: number; max: number }> = ({ value, max }) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

const ProgressStep: FC<{ title: string; detail: string; value: number; max: number; job?: ImportJobView }> = ({ title, detail, value, max, job }) => (
  <section className="flex flex-col gap-5 py-8" aria-live="polite">
    <div className="flex items-center gap-3">
      <Loader2 className="animate-spin text-muted-foreground" aria-hidden />
      <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
    </div>
    <ProgressBar value={value} max={max} />
    <p className="text-sm text-muted-foreground tabular-nums">{detail}</p>
    {job && job.looked > 0 && (
      <p className="text-sm tabular-nums">
        {plural(job.matched, "match", "matches")} so far{job.unmatched > 0 && `, ${fmt(job.unmatched)} to check later`}.
      </p>
    )}
    <p className="text-xs text-muted-foreground">You can leave this page open in the background. Closing it pauses the import; come back to carry on.</p>
  </section>
)

// ---- Preview -----------------------------------------------------------------------------

const Stat: FC<{ value: number; label: string; className?: string }> = ({ value, label, className }) => (
  <div className={cn("rounded-lg border p-4", className)}>
    <p className="text-2xl font-bold tabular-nums">{fmt(value)}</p>
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
)

// What the pre-cleaner set aside or had to decide, and the finishes it left undated. Shown before and after.
const FileNotesList: FC<{ notes: FileNotes | null; undatedFinished: number }> = ({ notes, undatedFinished }) => {
  const items: { key: string; icon: typeof CalendarOff; text: string; detail?: string }[] = []
  if (undatedFinished > 0) {
    items.push({
      key: "undated",
      icon: CalendarOff,
      text: `${plural(undatedFinished, "finished book has", "finished books have")} no finish date in your file.`,
      detail: "They're kept as finished with the date left blank rather than dated today, so your stats stay honest. Add a date from the book's page whenever you like.",
    })
  }
  if (notes?.quarantined.length) {
    const lines = notes.quarantined.slice(0, 6).map((q) => `row ${fmt(q.line)}${q.detail ? ` (${q.detail})` : ""}`).join("; ")
    items.push({
      key: "quarantined",
      icon: HelpCircle,
      text: `${plural(notes.quarantined.length, "row has", "rows have")} no title and ${notes.quarantined.length === 1 ? "was" : "were"} set aside.`,
      detail: `${lines}${notes.quarantined.length > 6 ? "…" : ""}. Everything else in the file came through.`,
    })
  }
  if (notes?.dateOrderGuessed) {
    items.push({
      key: "order",
      icon: HelpCircle,
      text: `Dates like 03/04/2024 were read as day/month${notes.dayFirst ? "" : " and month/day"}.`,
      detail: "Nothing in the file settled which way round they are. If yours are month/day, re-export from the app rather than a spreadsheet.",
    })
  }
  if (notes?.unreadableDateCount) {
    const examples = notes.unreadableDates.slice(0, 4).map((d) => `"${d.value}" (row ${fmt(d.line)})`).join(", ")
    items.push({
      key: "unreadable",
      icon: HelpCircle,
      text: `${plural(notes.unreadableDateCount, "date")} couldn't be read and ${notes.unreadableDateCount === 1 ? "was" : "were"} left blank.`,
      detail: `${examples}${notes.unreadableDateCount > 4 ? "…" : ""}.`,
    })
  }
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-3 text-sm">
      {items.map((item) => (
        <li key={item.key} className="flex gap-3">
          <item.icon size={18} className="mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden />
          <span>
            {item.text}
            {item.detail && <span className="block mt-1 text-muted-foreground">{item.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

const PreviewStep: FC<{ job: ImportJobView; onConfirm: () => Promise<void>; onCancel: () => void; onChange: (job: ImportJobView) => void }> = ({ job, onConfirm, onCancel, onChange }) => {
  const [busy, setBusy] = useState(false)
  const duplicates = job.duplicates.shelf + job.duplicates.file
  const unsure = job.uncertain.length
  const unmatched = job.unmatched

  return (
    <section className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-muted-foreground">{SOURCE_LABEL[job.source]} export{job.fileName ? ` · ${job.fileName}` : ""}</p>
        <h1 className="mt-1 text-3xl sm:text-4xl font-bold">Ready to import {plural(job.toImport, "book")}</h1>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {SHELVES.map((s) => <Stat key={s.status} value={job.byStatus[s.status] ?? 0} label={s.label} />)}
      </div>

      <ul className="flex flex-col gap-3 text-sm">
        <li className="flex gap-3">
          <BookCheck size={18} className="mt-0.5 flex-shrink-0 text-emerald-600" aria-hidden />
          <span><strong className="tabular-nums">{fmt(job.matched)}</strong> matched on Open Library, with covers and work details.</span>
        </li>
        {unsure > 0 && (
          <li className="flex gap-3">
            <Sparkles size={18} className="mt-0.5 flex-shrink-0 text-amber-600" aria-hidden />
            <span>
              <strong className="tabular-nums">{fmt(unsure)}</strong> {unsure === 1 ? "match" : "matches"} to check below. Any you don&apos;t check {unsure === 1 ? "is" : "are"} added as typed.
            </span>
          </li>
        )}
        {unmatched > 0 && (
          <li className="flex gap-3">
            <Search size={18} className="mt-0.5 flex-shrink-0 text-amber-600" aria-hidden />
            <span>
              <strong className="tabular-nums">{fmt(unmatched)}</strong> without a match. They&apos;re still imported, and you can match them afterwards.
              {job.samples.unmatched.length > 0 && <span className="block mt-1 text-muted-foreground">{job.samples.unmatched.join("; ")}{job.unmatched > job.samples.unmatched.length && "…"}</span>}
            </span>
          </li>
        )}
        {duplicates > 0 && (
          <li className="flex gap-3">
            <CopyX size={18} className="mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <strong className="tabular-nums">{fmt(duplicates)}</strong> skipped as already on your shelf{job.duplicates.file > 0 && ` or listed twice`}.
              {job.samples.duplicates.length > 0 && <span className="block mt-1 text-muted-foreground">{job.samples.duplicates.join("; ")}{duplicates > job.samples.duplicates.length && "…"}</span>}
            </span>
          </li>
        )}
      </ul>

      <FileNotesList notes={job.notes} undatedFinished={job.undatedFinished} />

      {unsure > 0 && <ReviewList job={job} onChange={onChange} />}

      <p className="text-sm text-muted-foreground">
        Imported books won&apos;t appear in your followers&apos; feeds, and only books you finished this year count toward this year&apos;s goal.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy || job.toImport === 0} onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }} className="gap-2">
          {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
          Import {plural(job.toImport, "book")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Choose a different file</Button>
      </div>
    </section>
  )
}

// ---- Review ------------------------------------------------------------------------------

// Matches the matcher wasn't sure of: one tap each, before anything is filed. Unchecked rows import as typed.
const ReviewList: FC<{ job: ImportJobView; onChange: (job: ImportJobView) => void }> = ({ job, onChange }) => {
  const [shown, setShown] = useState(8)
  const rows = job.uncertain
  return (
    <section aria-labelledby="review" className="flex flex-col gap-3">
      <div>
        <h2 id="review" className="text-lg font-semibold">{plural(rows.length, "match", "matches")} to check</h2>
        <p className="text-sm text-muted-foreground">
          Open Library wasn&apos;t sure about these. Confirm the suggestion, pick another, or add the book as it is in your file.
        </p>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border">
        {rows.slice(0, shown).map((row) => <ReviewRow key={row.index} jobId={job.id} row={row} onChange={onChange} />)}
      </ul>
      {rows.length > shown && (
        <Button type="button" variant="ghost" onClick={() => setShown((n) => n + 20)} className="self-start">Show more</Button>
      )}
    </section>
  )
}

const CoverThumb: FC<{ url: string | null }> = ({ url }) =>
  url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url.replace(/-L\.jpg$/, "-M.jpg")} alt="" className="h-20 w-14 rounded object-cover flex-shrink-0 bg-muted" />
    : <span className="h-20 w-14 rounded bg-muted flex-shrink-0" aria-hidden />

const ReviewRow: FC<{ jobId: string; row: UncertainRow; onChange: (job: ImportJobView) => void }> = ({ jobId, row, onChange }) => {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const yours = [row.author, row.year, row.format && FORMAT_LABEL[row.format]].filter(Boolean).join(" · ")
  const theirs = [row.pick.authors.slice(0, 2).join(", "), row.pick.year].filter(Boolean).join(" · ")

  const send = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const next = await step(jobId, { action: "decide", index: row.index, ...body })
      if (next) onChange(next)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Couldn't save that.", { retry: () => send(body) })
    } finally {
      setBusy(false)
    }
  }
  const pick = (c: ImportCandidate) => send({ choice: "pick", candidate: c })

  return (
    <li className="p-3 sm:p-4 flex flex-col gap-3">
      <div className="flex gap-3">
        <CoverThumb url={row.pick.coverUrl} />
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">In your file</p>
            <p className="font-medium leading-tight">{row.title}</p>
            {yours && <p className="text-sm text-muted-foreground">{yours}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Best guess <span className="normal-case tracking-normal tabular-nums">· {Math.round(row.confidence * 100)}% sure</span>
            </p>
            <p className="font-medium leading-tight">{row.pick.title ?? "Untitled"}</p>
            {theirs && <p className="text-sm text-muted-foreground">{theirs}</p>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => send({ choice: "accept" })} className="gap-1.5 flex-1 sm:flex-none">
          <Check size={14} aria-hidden /> That&apos;s right
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setOpen((o) => !o)} className="flex-1 sm:flex-none" aria-expanded={open}>
          Pick another
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => send({ choice: "typed" })} className="flex-1 sm:flex-none">
          Add as typed
        </Button>
      </div>
      {open && <WorkSearch id={`review-${row.index}`} initialQuery={`${row.title} ${row.author === "Unknown" ? "" : row.author}`.trim()} others={row.others} busy={busy} onPick={pick} />}
    </li>
  )
}

type Candidate = { workKey: string | null; title: string; author: string; pages: number | null; coverUrl: string | null; year?: number | null }

const asCandidate = (c: Candidate): ImportCandidate => ({
  workKey: c.workKey!,
  title: c.title,
  authors: c.author ? [c.author] : [],
  year: c.year ?? null,
  coverUrl: c.coverUrl,
  pages: c.pages,
  subjects: [],
})

// Other works to choose from: what the search already found for the row, then an Open Library search box.
const WorkSearch: FC<{ id: string; initialQuery: string; others?: ImportCandidate[]; busy: boolean; onPick: (c: ImportCandidate) => void }> = ({ id, initialQuery, others = [], busy, onPick }) => {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<ImportCandidate[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) return
    setSearching(true)
    setSearchFailed(false)
    try {
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(q.trim())}`)
      if (!res.ok) throw new Error("search failed")
      setResults(((await res.json()) as Candidate[]).filter((c) => c.workKey).map(asCandidate))
    } catch {
      setResults(null)
      setSearchFailed(true)
    } finally {
      setSearching(false)
    }
  }, [])

  // With nothing to offer up front, search for the row's own title straight away.
  useEffect(() => {
    if (others.length === 0) search(initialQuery)
    // Once, when the box opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The row's own candidates first; search results fill in behind them, without repeats.
  const shown = [...others, ...(results ?? []).filter((r) => !others.some((o) => o.workKey === r.workKey))]

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); search(query) }} className="flex gap-2">
        <label htmlFor={`q-${id}`} className="sr-only">Search Open Library</label>
        <input
          id={`q-${id}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-0 rounded-md border bg-background px-3 py-1.5 text-sm"
        />
        <Button type="submit" size="sm" disabled={searching || busy}>{searching ? <Loader2 size={14} className="animate-spin" aria-label="Searching" /> : "Search"}</Button>
      </form>
      {searchFailed && <SearchFailed onRetry={() => search(query)} />}
      {results && results.length === 0 && shown.length === 0 && <p className="text-sm text-muted-foreground">No results. Try a shorter title.</p>}
      {shown.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((c) => (
            <li key={c.workKey}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(c)}
                className="w-full flex gap-3 items-center rounded-md border p-2 text-left hover:bg-muted disabled:opacity-50"
              >
                {c.coverUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.coverUrl.replace(/-L\.jpg$/, "-S.jpg")} alt="" className="h-14 w-10 rounded object-cover flex-shrink-0 bg-muted" />
                  : <span className="h-14 w-10 rounded bg-muted flex-shrink-0" />}
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight truncate">{c.title ?? "Untitled"}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {c.authors.slice(0, 2).join(", ")}{c.year ? ` · ${c.year}` : ""}{c.pages ? ` · ${fmt(c.pages)} pages` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---- Summary -----------------------------------------------------------------------------

const SummaryStep: FC<{ job: ImportJobView; onChange: (job: ImportJobView) => void; onAnother: () => void }> = ({ job, onChange, onAnother }) => {
  const result = job.result!
  const years = result.firstYear !== null && result.lastYear !== null ? result.lastYear - result.firstYear + 1 : 0
  const headline = [
    plural(result.created, "book"),
    years > 1 ? plural(years, "year") : null,
    result.medals.length > 0 ? `${plural(result.medals.length, "medal")} earned` : null,
  ].filter(Boolean).join(", ")

  useCovers(job, onChange)

  return (
    <section className="flex flex-col gap-8">
      <header className="text-center flex flex-col items-center gap-3 py-4">
        <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 p-3"><Check size={28} aria-hidden /></span>
        <h1 className="text-3xl sm:text-4xl font-bold">{headline}</h1>
        <p className="text-muted-foreground">
          Welcome home.{result.duplicates > 0 && ` ${plural(result.duplicates, "book")} already on your shelf ${result.duplicates === 1 ? "was" : "were"} left as ${result.duplicates === 1 ? "it was" : "they were"}.`}
        </p>
        <Button asChild className="mt-2"><Link href="/">Go to my shelves</Link></Button>
      </header>

      {result.medals.length > 0 && (
        <section aria-labelledby="medals">
          <h2 id="medals" className="text-lg font-semibold mb-4">Medals your history earned</h2>
          <ul className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-6">
            {result.medals.map((m) => (
              <li key={m.key} className="flex flex-col items-center text-center gap-3">
                <Medal achievementKey={m.key.split(":")[0]} earned pill={fmt(Number(m.key.split(":")[1]))} className="w-16 sm:w-20" />
                <span className="text-xs font-medium leading-tight">{m.title}</span>
              </li>
            ))}
          </ul>
          <Link href="/achievements" className="mt-4 inline-block text-sm underline underline-offset-4">See all achievements</Link>
        </section>
      )}

      <FileNotesList notes={result.file ?? null} undatedFinished={result.undatedFinished} />

      {result.unmatched.length > 0 && <UnmatchedList job={job} onChange={onChange} />}

      {job.coversToCheck > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" aria-hidden /> Saving copies of your covers in the background. It&apos;s fine to leave.
        </p>
      )}

      <div>
        <Button type="button" variant="outline" onClick={onAnother}>Import another file</Button>
      </div>
    </section>
  )
}

// Copies covers a few at a time while the summary is open. Leaving is fine: the rest stay hotlinked.
function useCovers(job: ImportJobView, onChange: (job: ImportJobView) => void) {
  const pending = job.coversToCheck > 0
  const latest = useRef(onChange)
  latest.current = onChange
  useEffect(() => {
    if (!pending) return
    let alive = true
    ;(async () => {
      let failures = 0
      while (alive) {
        try {
          const next = await step(job.id, { action: "covers" })
          if (!alive || !next) return
          latest.current(next)
          if (next.coversToCheck === 0) return
          failures = 0
        } catch {
          if (++failures > 3) return
          await pause(3000 * failures)
        }
      }
    })()
    return () => { alive = false }
  }, [job.id, pending])
}

const UnmatchedList: FC<{ job: ImportJobView; onChange: (job: ImportJobView) => void }> = ({ job, onChange }) => {
  const unmatched = job.result!.unmatched
  const [shown, setShown] = useState(10)

  return (
    <section aria-labelledby="unmatched" className="flex flex-col gap-3">
      <div>
        <h2 id="unmatched" className="text-lg font-semibold">{plural(unmatched.length, "book")} without a match</h2>
        <p className="text-sm text-muted-foreground">They&apos;re on your shelves as you entered them. Find a match to add a cover, or keep them as they are.</p>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border">
        {unmatched.slice(0, shown).map((u) => <UnmatchedRow key={u.bookId} jobId={job.id} entry={u} onChange={onChange} />)}
      </ul>
      {unmatched.length > shown && (
        <Button type="button" variant="ghost" onClick={() => setShown((n) => n + 20)} className="self-start">Show more</Button>
      )}
    </section>
  )
}

const UnmatchedRow: FC<{ jobId: string; entry: { bookId: string; title: string; author: string }; onChange: (job: ImportJobView) => void }> = ({ jobId, entry, onChange }) => {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const send = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const next = await step(jobId, { bookId: entry.bookId, ...body })
      if (next) onChange(next)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Couldn't save that.", { retry: () => send(body) })
      setBusy(false)
    }
  }

  return (
    <li className="p-3 sm:p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[10rem]">
          <p className="font-medium leading-tight">{entry.title}</p>
          <p className="text-sm text-muted-foreground">{entry.author}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setOpen((o) => !o)} aria-expanded={open}>Find match</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => send({ action: "keep" })}>Keep as is</Button>
      </div>
      {open && (
        <WorkSearch
          id={entry.bookId}
          initialQuery={`${entry.title} ${entry.author === "Unknown" ? "" : entry.author}`.trim()}
          busy={busy}
          onPick={(c) => send({ action: "fix", workKey: c.workKey, coverUrl: c.coverUrl, pages: c.pages })}
        />
      )}
    </li>
  )
}
