"use client"
import { FC, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { notify } from '@/lib/notify'
import { BookCheck, CalendarOff, Check, Copy, CopyX, ExternalLink, FileUp, HelpCircle, Loader2, Search, Sparkles, Upload } from 'lucide-react'
import type { Status } from '@prisma/client'
import { Button } from '@/app/components/ui/button'
import Medal from '@/app/components/achievements/Medal'
import { cn } from '@/lib/utils'
import type { ImportJobView } from '@/lib/import/job'
import type { UncertainRow } from '@/lib/import/review'
import { SOURCE_LABEL, type FileNotes, type ImportCandidate } from '@/lib/import/types'
import { SearchFailed } from "@/app/components/modals/BookSearchResults";
import { AiLabel } from "@/app/components/discover/AskShelf";

const MAX_BYTES = 5 * 1024 * 1024

const SHELVES: { status: Status; label: string }[] = [
  { status: "COMPLETED", label: "Finished" },
  { status: "STARTED", label: "Reading" },
  { status: "NOT_STARTED", label: "Want to read" },
  { status: "PAUSED", label: "Paused" },
  { status: "DNF", label: "Did not finish" },
  { status: "NOT_INTERESTED", label: "Will not read" },
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

// A pasted list, or a .txt/.md file read in the browser. lib/import/text.ts reads it on the server.
export type ListUpload = { text: string; defaultStatus: "NOT_STARTED" | "COMPLETED"; useAi: boolean; fileName?: string | null }
type ListDraft = { text: string; fileName: string | null }

const isTextFile = (file: File) => /\.(txt|md|markdown)$/i.test(file.name) || file.type === "text/plain" || file.type === "text/markdown"

const ImportFlow: FC<{ aiAvailable: boolean; aiDefault: boolean }> = ({ aiAvailable, aiDefault }) => {
  const [job, setJob] = useState<ImportJobView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Kept here, not in the paste box, so "Change the list" brings the reader back to their text.
  const [draft, setDraft] = useState<ListDraft>({ text: "", fileName: null })
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

  // Once the books are on the shelves the pasted list has done its job, so the next import starts blank.
  // Any it couldn't find stay on the summary to copy.
  useEffect(() => {
    if (job?.status === "done") setDraft({ text: "", fileName: null })
  }, [job?.status])

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

  const uploadList = async (list: ListUpload) => {
    setError(null)
    try {
      const created = await call("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(list) })
      if (!created) return
      setJob(created)
      if (created.status === "matching") drive(created, "match", "matching")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that list.")
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
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm flex flex-wrap items-center gap-3">
          <span className="flex-1 min-w-[12rem]">{error}</span>
          {(job?.status === "matching" || job?.status === "importing") && (
            <Button type="button" size="sm" variant="outline" onClick={resume}>Carry on</Button>
          )}
        </div>
      )}
      {!job || job.status === "cancelled" ? <UploadStep onFile={upload} onList={uploadList} list={draft} onListChange={setDraft} aiAvailable={aiAvailable} aiDefault={aiDefault} />
        : job.status === "matching" ? (
          job.checking > 0 && job.looked >= job.total
            ? <ProgressStep title="Checking the unsure ones" detail={`${plural(job.checking, "title")} left to check`} value={job.total - job.checking} max={job.total} job={job} />
            : <ProgressStep title="Matching your books" detail={`Looking up ${fmt(job.looked)} of ${fmt(job.total)}`} value={job.looked} max={job.total} job={job} />
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
  { source: "Bookmark", steps: "An export from Bookmark itself (Settings → Your data → Export books) imports exactly as it left." },
]

type UploadProps = {
  onFile: (file: File) => Promise<void>
  onList: (list: ListUpload) => Promise<void>
  list: ListDraft
  onListChange: (list: ListDraft) => void
  aiAvailable: boolean
  aiDefault: boolean
}

const UploadStep: FC<UploadProps> = ({ onFile, onList, list, onListChange: setList, aiAvailable, aiDefault }) => {
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const take = async (file?: File | null) => {
    if (!file || busy) return
    // A plain text file is a list, not an export: it goes into the paste box to check first.
    if (isTextFile(file)) {
      if (file.size > 512 * 1024) return notify.error("That list is too long for one import. Split it in two.")
      setList({ text: await file.text(), fileName: file.name })
      document.getElementById("paste-list")?.focus()
      return
    }
    setBusy(true)
    try { await onFile(file) } finally { setBusy(false) }
  }

  return (
    <>
      <header>
        <h1 className="page-title">Bring your library with you</h1>
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
          accept=".csv,text/csv,.txt,.md,text/plain,text/markdown"
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

      <PasteList list={list} onChange={setList} onSubmit={onList} disabled={busy} aiAvailable={aiAvailable} aiDefault={aiDefault} />
    </>
  )
}

const PASTE_EXAMPLE = `Read 2024
- Fourth Wing by Rebecca Yarros
- The Seven Husbands of Evelyn Hugo - Taylor Jenkins Reid ⭐⭐⭐⭐⭐

TBR
- Babel
- Iron Flame (Rebecca Yarros)`

// A list from a notes app: one book a line, in whatever shape the reader keeps it.
const PasteList: FC<{
  list: ListDraft
  onChange: (list: ListDraft) => void
  onSubmit: (list: ListUpload) => Promise<void>
  disabled: boolean
  aiAvailable: boolean
  aiDefault: boolean
}> = ({ list, onChange, onSubmit, disabled, aiAvailable, aiDefault }) => {
  const [busy, setBusy] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<ListUpload["defaultStatus"]>("NOT_STARTED")
  const [useAi, setUseAi] = useState(aiAvailable && aiDefault)
  const lines = list.text.split(/\r?\n/).filter((l) => /\p{L}/u.test(l)).length

  const submit = async () => {
    if (busy || !list.text.trim()) return
    setBusy(true)
    try { await onSubmit({ text: list.text, defaultStatus, useAi: aiAvailable && useAi, fileName: list.fileName }) } finally { setBusy(false) }
  }

  return (
    <section aria-labelledby="paste" className="flex flex-col gap-4 rounded-xl border p-5 sm:p-6">
      <div>
        <h2 id="paste" className="text-lg font-semibold">Or paste a list</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep your books in a notes app? Paste the list here, one book a line. Authors help but aren&apos;t needed, and headings like
          &ldquo;Read&rdquo; or &ldquo;TBR&rdquo; put the books under them on that shelf. We find each book with search, and any we can&apos;t find are left out.
        </p>
      </div>
      <label htmlFor="paste-list" className="sr-only">Your list of books</label>
      <textarea
        id="paste-list"
        value={list.text}
        onChange={(e) => onChange({ text: e.target.value, fileName: null })}
        placeholder={PASTE_EXAMPLE}
        rows={8}
        spellCheck={false}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium mb-2">Books without a shelf go to</legend>
        <div className="flex flex-wrap gap-2">
          {([["NOT_STARTED", "Want to read"], ["COMPLETED", "Finished"]] as const).map(([value, label]) => (
            <label key={value} className={cn("cursor-pointer rounded-full border px-3 py-1 text-sm", defaultStatus === value ? "border-primary bg-primary/10" : "hover:bg-muted")}>
              <input type="radio" name="list-default" value={value} checked={defaultStatus === value} onChange={() => setDefaultStatus(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {aiAvailable && (
        <label className="flex gap-3 items-start text-sm cursor-pointer">
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" />
          <span>
            <span className="font-medium inline-flex items-center gap-1.5">Use AI to pick out the books <Sparkles size={13} className="text-brand" aria-hidden /></span>
            <span className="block text-muted-foreground">
              Better with messy lists: it skips notes to self and copies each title and author out of its line, word for word. It never adds a book that isn&apos;t in your list.
            </span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={disabled || busy || lines === 0} onClick={submit} className="gap-2">
          {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
          {busy ? "Reading your list…" : lines > 0 ? `Find these ${plural(lines, "line")}` : "Find these books"}
        </Button>
        {list.fileName && <span className="text-sm text-muted-foreground">From {list.fileName}</span>}
      </div>
    </section>
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
      <h1 className="page-title">{title}</h1>
    </div>
    <ProgressBar value={value} max={max} />
    <p className="text-sm text-muted-foreground tabular-nums">{detail}</p>
    {job && job.looked > 0 && (
      <p className="text-sm tabular-nums">
        {plural(job.matched, "match", "matches")} so far{job.unmatched > 0 && `, ${fmt(job.unmatched)} ${job.source === "list" ? "not found" : "to check later"}`}.
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
  const isList = job.source === "list"
  const readByAi = job.notes?.listReadBy === "model" || job.notes?.listReadBy === "mixed"

  return (
    <section className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
          {isList ? SOURCE_LABEL.list : `${SOURCE_LABEL[job.source]} export`}{job.fileName ? ` · ${job.fileName}` : ""}
          {readByAi && <AiLabel />}
        </p>
        <h1 className="page-title mt-1">Ready to import {plural(job.toImport, "book")}</h1>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {SHELVES.map((s) => <Stat key={s.status} value={job.byStatus[s.status] ?? 0} label={s.label} />)}
      </div>

      <ul className="flex flex-col gap-3 text-sm">
        <li className="flex gap-3">
          <BookCheck size={18} className="mt-0.5 flex-shrink-0 text-emerald-600" aria-hidden />
          <span><strong className="tabular-nums">{fmt(job.matched)}</strong> matched, with covers and book details.</span>
        </li>
        {unsure > 0 && (
          <li className="flex gap-3">
            <Sparkles size={18} className="mt-0.5 flex-shrink-0 text-amber-600" aria-hidden />
            <span>
              <strong className="tabular-nums">{fmt(unsure)}</strong> {unsure === 1 ? "match" : "matches"} to check below. Any you don&apos;t check {unsure === 1 ? "is" : "are"} {isList ? "left out" : "added as typed"}.
            </span>
          </li>
        )}
        {unmatched > 0 && (
          <li className="flex gap-3">
            <Search size={18} className="mt-0.5 flex-shrink-0 text-amber-600" aria-hidden />
            <span>
              {isList
                ? <><strong className="tabular-nums">{fmt(unmatched)}</strong> we couldn&apos;t find. They&apos;ll be left out, and you&apos;ll get the list to copy afterwards.</>
                : <><strong className="tabular-nums">{fmt(unmatched)}</strong> without a match. They&apos;re still imported, and you can match them afterwards.</>}
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

      {readByAi && (
        <p className="text-sm text-muted-foreground">
          AI picked the books out of your list, copying each title from its line. Every match comes from search, not from the AI.
        </p>
      )}

      <FileNotesList notes={job.notes} undatedFinished={isList ? 0 : job.undatedFinished} />

      {unsure > 0 && <ReviewList job={job} onChange={onChange} />}

      <p className="text-sm text-muted-foreground">
        Imported books won&apos;t appear in your followers&apos; feeds, and only books you finished this year count toward this year&apos;s goal.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy || job.toImport === 0} onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }} className="gap-2">
          {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
          Import {plural(job.toImport, "book")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>{isList ? "Change the list" : "Choose a different file"}</Button>
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
          We weren&apos;t sure about these. Confirm the suggestion, pick another, or {job.source === "list" ? "leave the book out" : "add the book as it is in your file"}.
        </p>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border">
        {rows.slice(0, shown).map((row) => <ReviewRow key={row.index} jobId={job.id} row={row} onChange={onChange} isList={job.source === "list"} />)}
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

const ReviewRow: FC<{ jobId: string; row: UncertainRow; onChange: (job: ImportJobView) => void; isList: boolean }> = ({ jobId, row, onChange, isList }) => {
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">In your {isList ? "list" : "file"}</p>
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
          {isList ? "Leave it out" : "Add as typed"}
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
        <label htmlFor={`q-${id}`} className="sr-only">Search for the book</label>
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
        <h1 className="page-title">{headline}</h1>
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

      <FileNotesList notes={result.file ?? null} undatedFinished={job.source === "list" ? 0 : result.undatedFinished} />

      {result.unmatched.length > 0 && <UnmatchedList job={job} onChange={onChange} />}

      {(result.leftOut?.length ?? 0) > 0 && <LeftOutList books={result.leftOut!} />}

      {job.coversToCheck > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" aria-hidden /> Saving copies of your covers in the background. It&apos;s fine to leave.
        </p>
      )}

      <div>
        <Button type="button" variant="outline" onClick={onAnother}>{job.source === "list" ? "Import another list" : "Import another file"}</Button>
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

// A pasted list only: the books search couldn't find, left off the shelf. One tap copies them, to add by hand
// or paste back in after a fix.
const LeftOutList: FC<{ books: { title: string; author: string }[] }> = ({ books }) => {
  const [shown, setShown] = useState(10)
  const asLine = (b: { title: string; author: string }) => (b.author === "Unknown" ? b.title : `${b.title} by ${b.author}`)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(books.map(asLine).join("\n"))
      notify.success(`Copied ${plural(books.length, "book")}`)
    } catch {
      notify.error("Couldn't copy. Select the list and copy it instead.")
    }
  }

  return (
    <section aria-labelledby="left-out" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[12rem]">
          <h2 id="left-out" className="text-lg font-semibold">{plural(books.length, "book")} we couldn&apos;t find</h2>
          <p className="text-sm text-muted-foreground">These weren&apos;t added. Copy them to add by hand, or fix a spelling and paste them in again.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={copy} className="gap-1.5"><Copy size={14} aria-hidden /> Copy list</Button>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border text-sm">
        {books.slice(0, shown).map((b, i) => <li key={i} className="px-3 py-2 sm:px-4">{asLine(b)}</li>)}
      </ul>
      {books.length > shown && (
        <Button type="button" variant="ghost" onClick={() => setShown((n) => n + 50)} className="self-start">Show more</Button>
      )}
    </section>
  )
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
