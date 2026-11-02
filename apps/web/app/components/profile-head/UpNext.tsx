"use client"
import { FC, useState } from 'react'
import useSWR from 'swr'
import type { Book } from '@prisma/client'
import axios from 'axios'
import { BookOpen, Check, Loader2 } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { notify, apiError } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { positionLabel, trackerGroups, type SeriesTrack } from '@/lib/series'
import { discoverBookOf, type DiscoverBook } from '@/lib/openLibrary'
import type { GenrePicks } from '@/lib/genrePicks'
import useBooks from '@/app/hooks/useBooks'
import useSettings from '@/app/hooks/useSettings'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import { copyCoverLater, refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { groupShelf } from '../books/shelf'
import BookCover from '../cards/BookCover'
import { SERIES_TRACKER_KEY } from '../series/FollowSeriesButton'

// Covers in the row: eight fill the books column on a wide screen; a phone swipes through them.
const MOST = 8

// One suggestion. On your shelf (`bookId`), Start moves it to Reading; off it (the next in a series you haven't
// shelved, a pick for you), Start adds it to Reading. Either way it's one tap with Undo, never a form: a book
// whose page count isn't known yet is logged in percent, chapters or location until it is.
interface Pick {
  key: string
  title: string
  author: string
  coverUrl: string | null
  cardColour?: string | null
  tag: string
  // Its place in a series, shown as a badge on the cover (the next in a series you're reading or follow).
  position?: number | null
  bookId?: string
  // Where it sits now, so Start can pick a paused book back up and Undo can put it back.
  status?: string | null
  // What the cover and title open in book details, and what Start adds when it isn't shelved.
  discover: DiscoverBook
}

// How long Start says "Reading" before the tile leaves the row.
const STARTED_MS = 1500

const PickTile: FC<{ pick: Pick; row?: boolean }> = ({ pick, row = false }) => {
  const { mutate } = useBooks()
  const openDetails = useBookDetailsModal((s) => s.onOpen)
  const [state, setState] = useState<'idle' | 'starting' | 'started'>('idle')
  const refresh = async () => { await mutate(); refreshAfterBookChange() }
  const paused = pick.status === "PAUSED"

  // Starts it straight away and offers Undo, as the app does everywhere, rather than asking first. A paused
  // book picks up where it was; one from your Want to read starts from the beginning; one not on your shelf
  // goes onto Reading, and Undo takes it off again.
  const start = async () => {
    setState('starting')
    let undo: () => Promise<unknown>
    try {
      if (pick.bookId) {
        const id = pick.bookId
        await axios.post("/api/book-progress", paused ? { id, action: "resume" } : { id, action: "start" })
        undo = () => axios.post("/api/book-progress", { id, action: paused ? "pause" : "wantToRead" })
      } else {
        const { discover: book } = pick
        const { data: saved } = await axios.post("/api/books", {
          title: book.title, author: book.author, pages: book.pages ?? undefined, coverImgSrc: book.coverUrl || "",
          workKey: book.workKey, editionKey: book.editionKey ?? undefined, isbn13: book.isbn13 ?? undefined,
          isbn10: book.isbn10 ?? undefined, hardcoverId: book.hardcoverId ?? undefined,
          description: book.description ?? undefined, status: "STARTED",
        })
        copyCoverLater(saved?.id)
        undo = () => axios.delete(`/api/books/${saved.id}`)
      }
    } catch (err) {
      setState('idle')
      // Shelved in another tab since the row loaded: the refresh moves it up to Continue reading.
      if (axios.isAxiosError(err) && err.response?.status === 409) { refresh(); return notify.info(apiError(err, "Already on your shelf")) }
      return notify.error(apiError(err, `Couldn't start ${pick.title}. Try again.`))
    }
    setState('started')
    notify.success(`Started ${pick.title}`, {
      action: {
        label: "Undo",
        onClick: () => { undo().then(refresh).catch((err) => notify.error(apiError(err, "Couldn't undo that"))) },
      },
    })
    setTimeout(refresh, STARTED_MS)
  }

  return (
    // Smaller than the Continue cards above, with a quiet Start, so what you're reading stays the loudest thing:
    // 96px wide on a phone (a row you swipe, the third cover peeking), 72px across seven columns from lg up.
    <li className={cn("flex w-24 min-w-0 shrink-0 snap-start flex-col", !row && "sm:w-auto")}>
      {/* The cover and the title both open book details. The title is the one button keyboards and screen
          readers get; the cover is the same button for a pointer, so it isn't announced twice. */}
      <button type="button" tabIndex={-1} aria-hidden onClick={() => openDetails(pick.discover)}
        className="relative block w-full rounded-md transition hover:opacity-90">
        <BookCover book={{ title: pick.title, author: pick.author, coverImage: pick.coverUrl || "", cardColour: pick.cardColour ?? null }}
          variant="thumb" sizes="(min-width: 1024px) 72px, 96px" className="w-full shadow-sm" />
        {/* A series book says where it sits, on the cover rather than in a line under the title. */}
        {pick.position != null && (
          <span title={pick.tag} className="absolute left-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/75 px-1.5 text-[11px] font-semibold tabular-nums leading-none text-white shadow-sm ring-1 ring-white/20">
            #{Number(pick.position.toFixed(2))}
          </span>
        )}
      </button>
      {/* Up to two lines. Start sits at the foot of the tile, so the row's buttons line up; a one-line title leaves its tile a line of space above it. */}
      {/* The clamp is on a span inside the button: some mobile browsers ignore a line clamp on the button itself,
          and a long title then runs past the tile. Anywhere-wrapping stops one long word doing the same. */}
      <p className="mb-2 mt-1.5 min-w-0 text-xs font-medium leading-snug" title={pick.title}>
        <button type="button" onClick={() => openDetails(pick.discover)} aria-label={`${pick.title}: about this book`}
          className="block w-full min-w-0 rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">{pick.title}</span>
        </button>
      </p>
      {/* One quiet pill at every width: 32px to look at, with a 44px tap area, full width under a phone's cover. */}
      <button type="button" onClick={start} disabled={state !== 'idle'}
        className={cn(
          "relative mt-auto inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
          "border-neutral-200 bg-neutral-100 hover:bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800",
          "after:absolute after:inset-x-0 after:-inset-y-1.5 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !row && "lg:w-auto lg:self-start",
        )}>
        {state === 'starting' ? <Loader2 size={13} className="animate-spin" aria-hidden />
          : state === 'started' ? <Check size={13} aria-hidden className="text-emerald-600 dark:text-emerald-400" />
          : <BookOpen size={13} aria-hidden />}
        {state === 'started' ? "Reading" : "Start"}
        <span className="sr-only"> {pick.title}</span>
      </button>
    </li>
  )
}

// Under Continue reading on your profile in bands: what to start next, one tap each. The next book in a series
// you're reading or follow comes first (never one you put down), then your Want to read, newest first, then
// popular books in the genres you picked, until there are four to six.
// `cap`: only that many, in a row of three columns, for the half of the column it shares with Lists.
// `bare`: no heading of its own, where the heading above already says Up next (nothing on the go, or the
// Update sheet after Finished). `row`: a row you swipe at every width, for somewhere narrow (that sheet).
// `after`: the book just finished, which adds a short "Because you finished" row of books like it above the rest.
const UpNext: FC<{ bare?: boolean; row?: boolean; cap?: number; after?: { title: string; author: string } }> = ({ bare = false, row = false, cap, after }) => {
  const { books } = useBooks()
  const { settings } = useSettings()
  const { data: series } = useSWR<{ series: SeriesTrack[] }>(SERIES_TRACKER_KEY, fetcher, swrOptions)
  const { data: genre } = useSWR<GenrePicks>('/api/discover/for-you', fetcher, swrOptions)
  // Fetched once per finished book; empty (and the row left out) when there aren't two or three good matches.
  const { data: like } = useSWR<{ books: DiscoverBook[] }>(
    after ? `/api/discover/similar?title=${encodeURIComponent(after.title)}&author=${encodeURIComponent(after.author)}` : null, fetcher, swrOptions)
  if (!Array.isArray(books)) return null

  const picks: Pick[] = []
  const seen = new Set<string>()
  const similar: Pick[] = (like?.books ?? []).map((book) => {
    seen.add(`${book.title}|${book.author}`.toLowerCase())
    return { key: `like-${book.hardcoverId ?? book.title}`, title: book.title, author: book.author, coverUrl: book.coverUrl, tag: book.author, discover: book }
  })
  const add = (pick: Pick) => {
    const k = `${pick.title}|${pick.author}`.toLowerCase()
    if (seen.has(k) || picks.length >= (cap ?? MOST)) return
    seen.add(k)
    picks.push(pick)
  }
  for (const track of trackerGroups(series?.series ?? []).nextUp) {
    const next = track.next
    if (!next || (next.status && next.status !== "NOT_STARTED" && next.status !== "PAUSED")) continue
    if (track.entries.some((e) => e.status === "DNF")) continue
    add({
      key: `series-${track.key}`, title: next.title, author: next.author, coverUrl: next.coverUrl,
      tag: [positionLabel(next.position), track.name].filter(Boolean).join(" · "),
      position: next.position, bookId: next.bookId ?? undefined, status: next.status,
      discover: { workKey: next.workKey, title: next.title, author: next.author, pages: null, coverUrl: next.coverUrl },
    })
  }
  // A shelved book's place in its series: from /api/books (the catalogue's), else the series tracker's.
  const positionOf = new Map((series?.series ?? []).flatMap((track) => track.entries.flatMap((e) => (e.bookId && e.position !== null ? [[e.bookId, e.position] as const] : []))))
  const placeOf = (book: Book) => (book as Book & { seriesPosition?: number | null }).seriesPosition ?? positionOf.get(book.id)
  for (const book of groupShelf(books as Book[]).wantToRead) {
    add({ key: book.id, title: book.title, author: book.author, coverUrl: book.coverImage, cardColour: book.cardColour, tag: "Want to read", position: placeOf(book), bookId: book.id, status: book.status, discover: discoverBookOf(book) })
  }
  if (!settings?.hideShelfPicks) {
    const label = genre?.genres[0]?.label
    for (const book of genre?.books ?? []) {
      add({ key: `genre-${book.workKey ?? book.title}`, title: book.title, author: book.author, coverUrl: book.coverUrl, tag: label ? `For you · ${label}` : "For you", discover: book })
    }
  }
  if (picks.length === 0 && similar.length === 0) return null

  return (
    <section aria-labelledby={bare ? undefined : "up-next"} aria-label={bare ? "Up next" : undefined} className={bare || cap ? undefined : "mt-8"}>
      {/* Capped, it sits beside Lists: the heading takes a section heading's height so the two line up. */}
      {!bare && <h2 id="up-next" className={cn("text-lg font-semibold", cap ? "mb-5 flex min-h-10 items-center" : "mb-4")}>Up next</h2>}
      {after && similar.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Because you finished {after.title}</p>
          <ul className="relative flex gap-3 overflow-x-auto overflow-y-hidden pb-2">
            {similar.map((pick) => <PickTile key={pick.key} pick={pick} row />)}
          </ul>
        </div>
      )}
      {after && similar.length > 0 && picks.length > 0 && <p className="mb-2 text-xs font-medium text-muted-foreground">More to read</p>}
      <ul className={cap ? "grid grid-cols-3 gap-3" : cn(
        // Relative, so the Start buttons' screen-reader text stays inside the scroller instead of widening the page.
        // Out to the screen's edges on a phone, with the page's 16px kept as scroll padding too: without it each
        // tile snaps to the scroller's very edge and the first cover touches the side of the screen.
        // overflow-y-hidden: overflow-x-auto alone makes it a vertical scroller too, and the Start pills' tap areas
        // reaching past the bottom let the row be dragged up and down. pb-2 keeps those tap areas inside it.
        "relative flex gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x pb-2 max-sm:-mx-4 max-sm:px-4 max-sm:scroll-px-4",
        !row && "sm:grid sm:grid-cols-6 sm:overflow-visible lg:grid-cols-7 sm:max-lg:[&>li:nth-child(n+7)]:hidden lg:[&>li:nth-child(n+8)]:hidden",
      )}>
        {picks.map((pick) => <PickTile key={pick.key} pick={pick} row={row} />)}
      </ul>
    </section>
  )
}

export default UpNext
