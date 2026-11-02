"use client"
import { FC, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import moment from 'moment'
import { notify, apiError } from '@/lib/notify'
import { ArrowLeft, Check, Lock, Plus, Search, X } from 'lucide-react'
import type { Book } from '@prisma/client'
import { cn } from '@/lib/utils'
import { sameBook } from '@/lib/workKey'
import useBooks from '@/app/hooks/useBooks'
import useBuddyReads from '@/app/hooks/useBuddyReads'
import useBookSearch from '@/app/hooks/useBookSearch'
import { copyCoverLater, refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { LABEL_MAX, SCHEDULE_MAX } from '@/lib/buddyReads'
import { clubBookLeftOutMessage } from '@/lib/clubs'
import { formatLength, progressScale } from '@/lib/progress'
import BookCover from '../cards/BookCover'
import BookSearchResults, { BookSearchResult } from '../modals/BookSearchResults'
import FetchErrorState from '../FetchErrorState'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import UpgradePrompt from '../plus/UpgradePrompt'
import { ClearableInput } from '@/app/components/ui/clearable-input'

// Books worth reading together: not ones already finished or given up on.
const SHELVES: Record<string, string> = { STARTED: "Reading", PAUSED: "Paused", NOT_STARTED: "Want to read" }
// How the shelf groups its covers, in this order.
const GROUPS: { status: string, label: string }[] = [
  { status: "STARTED", label: "Reading now" },
  { status: "PAUSED", label: "Paused" },
  { status: "NOT_STARTED", label: "Want to read" },
]
// One row on desktop, two on phones; the rest wait behind "Show all".
const COVERS_SHOWN = 6

type Row = { label: string, until: string, due: string }

// 44px to tap on touch screens, and 16px text so iOS doesn't zoom in on focus; compact with a mouse.
const inputClass = "h-11 pointer-fine:h-9 w-full rounded-md border border-input bg-background px-3 text-base pointer-fine:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// With `club`, it starts the club's next book instead (POST /api/clubs/[id]/circles): every member is added,
// and it counts against the club's open books rather than the reader's own hosting limit.
const NewBuddyReadForm: FC<{ initialBookId?: string, club?: { id: string, name: string } }> = ({ initialBookId, club }) => {
  const router = useRouter()
  const { books, isError, mutate } = useBooks()
  const { hosting } = useBuddyReads(club ? null : undefined)
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
  // Once a book is picked the picker folds away to just that book, until the reader asks to change it.
  const [changing, setChanging] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
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
  const picking = (!chosen && !found) || changing

  const pickShelfBook = (id: string) => {
    setFound(null)
    setFoundNotice(null)
    setBookId(id)
    setQuery("")
    setChanging(false)
  }

  const changeBook = () => {
    setChanging(true)
    // Wait for the picker to render before focusing its box.
    setTimeout(() => searchInput.current?.focus())
  }

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
      setChanging(false)
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
    setChanging(false)
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
    shelfId.then((id) => axios.post(club ? `/api/clubs/${club.id}/circles` : "/api/buddy-reads", {
      bookId: id,
      // Local midnight on the chosen day.
      startsAt: moment(startsOn, "YYYY-MM-DD").toISOString(),
      schedule,
    })).then(({ data }) => {
      if (club && data.leftOut > 0) notify.info(clubBookLeftOutMessage(data.leftOut))
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
          <Link href={club ? `/clubs/${club.id}` : "/circles"} className="-my-3 inline-flex w-fit items-center gap-1 py-3 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} aria-hidden /> {club ? club.name : "Reading circles"}
          </Link>
          <h1 className="page-title">{club ? "Start the next book" : "Start a reading circle"}</h1>
          {club ? (
            <p className="max-w-prose text-muted-foreground">Choose a book from your shelf or search for one. Everyone in {club.name} is added to its reading circle, and the book goes in their Want to read until they start it.</p>
          ) : (
            <p className="max-w-prose text-muted-foreground">Choose a book from your shelf or search for one. You&apos;ll get a link to share; anyone with it can join, and the book goes on their shelf too.</p>
          )}
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
            {picking && (
              <div role="tablist" aria-label="Choose a book from" className="inline-flex rounded-full bg-neutral-100 dark:bg-neutral-900 p-0.5">
                {([["search", "Search"], ["shelf", "Your shelf"]] as const).map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={source === value} onClick={() => switchSource(value)} className={cn("h-10 px-4 pointer-fine:h-7 pointer-fine:px-3 rounded-full text-xs font-medium transition", source === value ? "bg-background dark:bg-neutral-700 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!picking ? (
            // The pick, folded down so the date and schedule sit right under it.
            // On phones the button drops under the title, so the title keeps its width.
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3 sm:flex">
              <BookCover book={chosen ?? { title: found!.title, author: found!.author, coverImage: found!.coverUrl || "", cardColour: null }} variant="thumb" sizes="56px" className="row-span-2 w-14 shrink-0 sm:row-span-1" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug line-clamp-2">{chosenTitle}</span>
                <span className="block text-sm text-muted-foreground line-clamp-2 sm:line-clamp-1">
                  {chosen
                    ? `${chosen.author} · ${SHELVES[chosen.status]}${formatLength(chosen) ? ` · ${formatLength(chosen)}` : ""}`
                    : `${found!.author} · Goes on your shelf as Want to read`}
                </span>
              </span>
              <button type="button" onClick={changeBook} disabled={isSaving} className="justify-self-start shrink-0 h-11 px-4 pointer-fine:h-8 pointer-fine:px-3 rounded-full border border-neutral-300 dark:border-neutral-700 text-xs font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Change book
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden />
                <input ref={searchInput} value={query} onChange={(e) => { setQuery(e.target.value); setFoundNotice(null) }} placeholder={source === "search" ? "Search by title or author" : "Filter your books"} aria-label={source === "search" ? "Search for a book" : "Filter your books"} autoComplete="off" disabled={isSaving} className={cn(inputClass, "h-11 pointer-fine:h-10 pl-9", query && "pr-12 pointer-fine:pr-10")} />
                {query && (
                  <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); searchInput.current?.focus() }} className="absolute right-0 top-1/2 -translate-y-1/2 grid size-11 pointer-fine:right-1 pointer-fine:size-8 place-items-center rounded-full text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground">
                    <X size={15} aria-hidden />
                  </button>
                )}
              </div>
              {changing && chosenTitle && (
                <p className="px-1 text-sm text-muted-foreground">
                  Or <button type="button" onClick={() => { setChanging(false); setQuery("") }} className="-my-3 py-3 font-medium text-foreground underline underline-offset-4">keep {chosenTitle}</button>.
                </p>
              )}

              {source === "search" ? (
                query.trim().length >= 3 && <BookSearchResults results={results} isLoading={isSearching} onSelect={pickFound} failed={searchFailed} onRetry={() => setSearchAttempt((n) => n + 1)} />
              ) : isError && !books ? (
                <FetchErrorState error={isError} what="your shelf" onRetry={() => mutate()} />
              ) : !books ? (
                <div className="h-48 rounded-xl bg-neutral-100 dark:bg-neutral-900 motion-safe:animate-pulse" aria-busy="true" />
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing in Want to read or Reading yet.{" "}
                  <button type="button" onClick={() => switchSource("search")} className="font-medium text-foreground underline underline-offset-4">Search for a book</button> instead.
                </p>
              ) : shelfMatches.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">None of your books match.</p>
              ) : (
                <div className="mt-2 flex flex-col gap-8">
                  {GROUPS.map(({ status, label }) => {
                    const group = shelfMatches.filter((b) => b.status === status)
                    if (group.length === 0) return null
                    // A filter shows every match; otherwise a row, with the pick kept in view.
                    const filtering = !!query.trim()
                    let shown = filtering || expanded[status] ? group : group.slice(0, COVERS_SHOWN)
                    if (chosen && group.includes(chosen) && !shown.includes(chosen)) shown = [...shown.slice(0, COVERS_SHOWN - 1), chosen]
                    return (
                      <section key={status} aria-labelledby={`shelf-${status}`} className="flex flex-col gap-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 id={`shelf-${status}`} className="text-xs font-medium text-muted-foreground">{label} · {group.length}</h3>
                          {!filtering && group.length > COVERS_SHOWN && (
                            <button type="button" onClick={() => setExpanded((e) => ({ ...e, [status]: !e[status] }))} className="-my-3 -mr-2 px-2 py-3 text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
                              {expanded[status] ? "Show fewer" : `Show all ${group.length}`}
                            </button>
                          )}
                        </div>
                        <ul className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-5">
                          {shown.map((b) => {
                            const selected = b.id === chosen?.id
                            return (
                              <li key={b.id}>
                                <button type="button" aria-pressed={selected} onClick={() => pickShelfBook(b.id)} className="group flex w-full flex-col gap-2 rounded-md text-left focus-visible:outline-none">
                                  <span className={cn(
                                    "relative block w-full rounded-md transition group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
                                    selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "group-hover:ring-2 group-hover:ring-neutral-400 dark:group-hover:ring-neutral-600 group-hover:ring-offset-2 group-hover:ring-offset-background"
                                  )}>
                                    <BookCover book={b} sizes="(min-width: 640px) 100px, 30vw" />
                                    {selected && (
                                      <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-foreground text-background">
                                        <Check size={14} strokeWidth={3} aria-hidden />
                                      </span>
                                    )}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium leading-snug line-clamp-2">{b.title}</span>
                                    <span className="block text-xs text-muted-foreground truncate">{b.author}</span>
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    )
                  })}
                </div>
              )}
            </>
          )}
          {foundNotice && <p role="status" className="px-1 text-sm text-muted-foreground">{foundNotice}</p>}
          {chosen && !chosenHasLength && (
            <p className="text-sm text-muted-foreground">This book has no page count, so everyone logs their progress as a percent.</p>
          )}
        </div>

        <div className="flex flex-col gap-2 max-w-xs">
          <label htmlFor="starts-on" className="text-sm font-medium">Start date</label>
          <input id="starts-on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required className={inputClass} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Reading plan <span className="font-normal text-muted-foreground">· optional</span></legend>
          <p className="text-sm text-muted-foreground">Split the book into stops so everyone keeps pace and talks about each part together, like &ldquo;Chapters 1–5, to 25%, by 3 Nov&rdquo;. Percentages work whichever edition people have.</p>
          {rows.length > 0 && (
            <div className="flex flex-col gap-2">
              {/* Column names on wider screens; on phones each row stacks and labels its own fields. */}
              <div aria-hidden className="hidden sm:grid grid-cols-[minmax(0,1fr)_88px_150px_44px] pointer-fine:grid-cols-[minmax(0,1fr)_88px_150px_36px] gap-2 px-1 text-xs text-muted-foreground">
                <span>Checkpoint</span><span>Up to</span><span>Due by</span>
              </div>
              <ol className="flex flex-col gap-3 sm:gap-2">
                {rows.map((r, i) => (
                  <li key={i} className="grid grid-cols-[88px_minmax(0,1fr)_auto] gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 sm:grid-cols-[minmax(0,1fr)_88px_150px_44px] pointer-fine:sm:grid-cols-[minmax(0,1fr)_88px_150px_36px] sm:items-center sm:rounded-none sm:border-0 sm:p-0">
                    <ClearableInput aria-label={`Checkpoint ${i + 1} name`} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} maxLength={LABEL_MAX} placeholder="Chapters 1–5" wrapperClassName="col-span-2 sm:col-span-1" className={inputClass} />
                    <label className="row-start-2 flex flex-col gap-1 sm:row-start-auto">
                      <span className="text-xs text-muted-foreground sm:sr-only">Up to</span>
                      <input aria-label={`Checkpoint ${i + 1} percent`} value={r.until} onChange={(e) => setRow(i, { until: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} inputMode="decimal" placeholder="25%" className={inputClass} />
                    </label>
                    <label className="col-span-2 row-start-2 flex flex-col gap-1 sm:col-span-1 sm:row-start-auto">
                      <span className="text-xs text-muted-foreground sm:sr-only">Due by</span>
                      <input aria-label={`Checkpoint ${i + 1} due date`} type="date" value={r.due} onChange={(e) => setRow(i, { due: e.target.value })} className={inputClass} />
                    </label>
                    <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove checkpoint ${i + 1}`} className="col-start-3 row-start-1 grid size-11 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 sm:col-start-auto sm:row-start-auto pointer-fine:size-9">
                      <X size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {rows.length < SCHEDULE_MAX && (
            <button type="button" onClick={() => setRows([...rows, { label: "", until: "", due: "" }])} className={cn(secondaryButtonClass, "w-fit")}>
              <Plus size={16} aria-hidden /> Add a checkpoint
            </button>
          )}
        </fieldset>
      </div>

      {/* Full width and stacked on phones, with the main action on top where the thumb is. */}
      <div className="flex flex-col-reverse gap-3 border-t border-neutral-200 dark:border-neutral-800 pt-6 sm:flex-row sm:justify-end">
        <Link href={club ? `/clubs/${club.id}` : "/circles"} className={secondaryButtonClass}>Cancel</Link>
        <button type="submit" disabled={(!chosen && !found) || blocked || isSaving} className={primaryButtonClass}>
          {isSaving ? "Starting…" : club ? "Start and add the club" : "Start and get the link"}
        </button>
      </div>
    </form>
  )
}

export default NewBuddyReadForm
