"use client"
import { FC, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import moment from 'moment'
import { notify, apiError } from '@/lib/notify'
import { ArrowLeft, Lock, Plus, Search, X } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { sameBook } from '@/lib/workKey'
import useBooks from '@/app/hooks/useBooks'
import useBuddyReads from '@/app/hooks/useBuddyReads'
import useBookSearch from '@/app/hooks/useBookSearch'
import { copyCoverLater, refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { LABEL_MAX, SCHEDULE_MAX } from '@/lib/buddyReads'
import { formatLength, progressScale } from '@/lib/progress'
import BookCover from '../cards/BookCover'
import BookSearchResults, { BookSearchResult } from '../modals/BookSearchResults'
import FetchErrorState from '../FetchErrorState'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import UpgradePrompt from '../plus/UpgradePrompt'

// Books worth reading together: not ones already finished or given up on.
const SHELVES: Record<string, string> = { STARTED: "Reading", PAUSED: "Paused", NOT_STARTED: "Want to read" }

type Row = { label: string, until: string, due: string }

const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const NewBuddyReadForm: FC<{ initialBookId?: string }> = ({ initialBookId }) => {
  const router = useRouter()
  const { books, isError, mutate } = useBooks()
  const { hosting } = useBuddyReads()
  const [bookId, setBookId] = useState<string | undefined>(initialBookId)
  const [startsOn, setStartsOn] = useState(moment().format("YYYY-MM-DD"))
  const [rows, setRows] = useState<Row[]>([])
  const [isSaving, setIsSaving] = useState(false)
  // Unset until the reader picks a tab: the shelf when it has something to read together, search when it doesn't.
  const [sourceChoice, setSourceChoice] = useState<"search" | "shelf" | null>(null)
  const [query, setQuery] = useState("")
  const [searchAttempt, setSearchAttempt] = useState(0)
  // A book found by search. It only goes on the shelf (as Want to read) once the circle starts.
  const [found, setFound] = useState<BookSearchResult | null>(null)
  const [foundNotice, setFoundNotice] = useState<string | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  const shelf = (books ?? []) as Book[]
  const candidates = shelf.filter((b) => b.status in SHELVES)
  const source = sourceChoice ?? (initialBookId || candidates.length > 0 || !books ? "shelf" : "search")
  const { results, isSearching, searchFailed } = useBookSearch(query, { enabled: source === "search", attempt: searchAttempt })
  const shelfMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? candidates.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)) : candidates
  }, [candidates, query])

  const chosen = found ? null : candidates.find((b) => b.id === bookId)
  // Pages or minutes: either works, as long as the book has a length to measure progress against.
  const chosenHasLength = chosen ? progressScale(chosen).total > 0 : !!found?.pages
  const blocked = hosting !== null && !hosting.allowed

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const switchSource = (next: "search" | "shelf") => {
    setSourceChoice(next)
    setQuery("")
    setFoundNotice(null)
    searchInput.current?.focus()
  }

  const pickFound = (result: BookSearchResult) => {
    setQuery("")
    const onShelf = shelf.find((b) => sameBook(b, result))
    if (onShelf && onShelf.status in SHELVES) {
      // Already there: use that copy, so nothing is shelved twice.
      setFound(null)
      setBookId(onShelf.id)
      setFoundNotice(`"${onShelf.title}" is already on your shelf, so the circle uses that copy.`)
      return
    }
    if (onShelf) {
      setFoundNotice(`"${onShelf.title}" is on your shelf as finished or not finished. Move it to Want to read or Reading to start a circle with it.`)
      return
    }
    setFoundNotice(null)
    setBookId(undefined)
    setFound(result)
  }

  // A searched-for book goes on the shelf as Want to read first; the circle needs a shelf copy to point at.
  const shelveFound = (book: BookSearchResult): Promise<string> =>
    axios.post("/api/books", {
      title: book.title,
      author: book.author,
      pages: book.pages ?? undefined,
      coverImgSrc: book.coverUrl || "",
      workKey: book.workKey,
      editionKey: book.editionKey ?? undefined,
      isbn13: book.isbn13 ?? undefined,
      isbn10: book.isbn10 ?? undefined,
      hardcoverId: book.hardcoverId ?? undefined,
      status: "NOT_STARTED",
    }).then(({ data: saved }) => {
      mutate()
      refreshAfterBookChange()
      copyCoverLater(saved?.id)
      return saved.id as string
    }).catch((err) => {
      // Already on the shelf (the list here was stale): start the circle with that copy.
      const existingId = err?.response?.status === 409 ? err.response.data?.bookId : null
      if (existingId) {
        mutate()
        return existingId as string
      }
      throw err
    })

  const submit = () => {
    if ((!chosen && !found) || isSaving) return
    const schedule = rows.filter((r) => r.label.trim()).map((r) => ({
      label: r.label.trim(),
      until: r.until === "" ? null : Math.max(0, Math.min(100, Number(r.until))),
      due: r.due || null,
    }))
    setIsSaving(true)
    const shelfId = chosen ? Promise.resolve(chosen.id) : shelveFound(found!)
    shelfId.then((id) => axios.post("/api/buddy-reads", {
      bookId: id,
      // Local midnight on the chosen day.
      startsAt: moment(startsOn, "YYYY-MM-DD").toISOString(),
      schedule,
    })).then(({ data }) => {
      router.push(`/circles/${data.id}`)
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't start the reading circle."))
      setIsSaving(false)
    })
  }

  const chosenTitle = chosen?.title ?? found?.title

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-10">
      <div className="flex max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-3">
          <Link href="/circles" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} aria-hidden /> Reading circles
          </Link>
          <h1 className="page-title">Start a reading circle</h1>
          <p className="text-muted-foreground">Choose a book from your shelf or search for one. You&apos;ll get a link to share; anyone with it can join, and the book goes on their shelf too.</p>
        </div>

        {blocked && hosting.upgrade && <UpgradePrompt feature="canHostUnlimited" message={hosting.message ?? undefined} />}
        {blocked && !hosting.upgrade && (
          <p className="flex items-start gap-2 rounded-xl bg-neutral-100 dark:bg-neutral-900 px-4 py-3 text-sm">
            <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>{hosting.message} <Link href="/circles" className="font-medium underline underline-offset-4">See your reading circles</Link></span>
          </p>
        )}

        <div role="group" aria-labelledby="circle-book" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="circle-book" className="text-sm font-medium">Book</h2>
            <div role="tablist" aria-label="Choose a book from" className="inline-flex rounded-full bg-neutral-100 dark:bg-neutral-900 p-0.5">
              {([["search", "Search"], ["shelf", "Your shelf"]] as const).map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={source === value} onClick={() => switchSource(value)} className={cn("h-7 px-3 rounded-full text-xs font-medium transition", source === value ? "bg-background dark:bg-neutral-700 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden />
            <input ref={searchInput} value={query} onChange={(e) => { setQuery(e.target.value); setFoundNotice(null) }} placeholder={source === "search" ? "Search by title or author" : "Filter your books"} aria-label={source === "search" ? "Search for a book" : "Filter your books"} autoComplete="off" disabled={isSaving} className={cn(inputClass, "h-10 pl-9", query && "pr-10")} />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); searchInput.current?.focus() }} className="absolute right-1 top-1/2 -translate-y-1/2 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground">
                <X size={15} aria-hidden />
              </button>
            )}
          </div>
          {foundNotice && <p role="status" className="px-1 text-sm text-muted-foreground">{foundNotice}</p>}

          {/* The pick, when the list below doesn't show it: a book found by search, or a shelf book while searching. */}
          {(found || (chosen && source === "search")) && (
            <div className="flex items-center gap-3 rounded-lg border border-foreground bg-neutral-100 dark:bg-neutral-900 p-2">
              <BookCover book={chosen ?? { title: found!.title, author: found!.author, coverImage: found!.coverUrl || "", cardColour: null }} variant="thumb" sizes="40px" className="w-10 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug line-clamp-2">{chosenTitle}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {chosen ? `${chosen.author} · ${SHELVES[chosen.status]}` : `${found!.author} · Goes on your shelf as Want to read`}
                </span>
              </span>
              <button type="button" aria-label={`Choose a different book than ${chosenTitle}`} onClick={() => { setFound(null); setBookId(undefined); searchInput.current?.focus() }} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-foreground">
                <X size={15} aria-hidden />
              </button>
            </div>
          )}

          {source === "search" ? (
            query.trim().length >= 3 && <BookSearchResults results={results} isLoading={isSearching} onSelect={pickFound} failed={searchFailed} onRetry={() => setSearchAttempt((n) => n + 1)} />
          ) : isError && !books ? (
            <FetchErrorState error={isError} what="your shelf" onRetry={() => mutate()} />
          ) : !books ? (
            <div className="h-24 rounded-xl bg-neutral-100 dark:bg-neutral-900 animate-pulse" aria-busy="true" />
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing in Want to read or Reading yet.{" "}
              <button type="button" onClick={() => switchSource("search")} className="font-medium text-foreground underline underline-offset-4">Search for a book</button> instead.
            </p>
          ) : shelfMatches.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">None of your books match.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto p-1 -m-1">
              {shelfMatches.map((b) => (
                <li key={b.id}>
                  <label className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    b.id === chosen?.id ? "border-foreground bg-neutral-100 dark:bg-neutral-900" : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  )}>
                    <input type="radio" name="book" value={b.id} checked={b.id === chosen?.id} onChange={() => { setFound(null); setFoundNotice(null); setBookId(b.id) }} className="sr-only" />
                    <BookCover book={b} variant="thumb" sizes="40px" className="w-10 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-snug line-clamp-2">{b.title}</span>
                      <span className="block text-xs text-muted-foreground truncate">{b.author} · {SHELVES[b.status]}{formatLength(b) ? ` · ${formatLength(b)}` : ""}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {chosen && !chosenHasLength && (
            <p className="text-sm text-muted-foreground">This book has no page count, so everyone logs their progress as a percent.</p>
          )}
        </div>

        <div className="flex flex-col gap-2 max-w-xs">
          <label htmlFor="starts-on" className="text-sm font-medium">Start date</label>
          <input id="starts-on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required className={inputClass} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Schedule <span className="font-normal text-muted-foreground">· optional</span></legend>
          <p className="text-sm text-muted-foreground">Checkpoints to read up to, as a percent so they work in any edition.</p>
          {rows.length > 0 && (
            <ol className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_72px_auto] sm:grid-cols-[minmax(0,1fr)_88px_150px_auto] items-center gap-2">
                  <input aria-label={`Checkpoint ${i + 1} name`} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} maxLength={LABEL_MAX} placeholder="Chapters 1–5" className={inputClass} />
                  <input aria-label={`Checkpoint ${i + 1} percent`} value={r.until} onChange={(e) => setRow(i, { until: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} inputMode="decimal" placeholder="25%" className={inputClass} />
                  <input aria-label={`Checkpoint ${i + 1} due date`} type="date" value={r.due} onChange={(e) => setRow(i, { due: e.target.value })} className={cn(inputClass, "hidden sm:block")} />
                  <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove checkpoint ${i + 1}`} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <X size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          )}
          {rows.length < SCHEDULE_MAX && (
            <button type="button" onClick={() => setRows([...rows, { label: "", until: "", due: "" }])} className={`${secondaryButtonClass} w-fit`}>
              <Plus size={16} aria-hidden /> Add a checkpoint
            </button>
          )}
        </fieldset>
      </div>

      <div className="flex justify-end gap-3 border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <Link href="/circles" className={secondaryButtonClass}>Cancel</Link>
        <button type="submit" disabled={(!chosen && !found) || blocked || isSaving} className={primaryButtonClass}>
          {isSaving ? "Starting…" : "Start and get the link"}
        </button>
      </div>
    </form>
  )
}

export default NewBuddyReadForm
