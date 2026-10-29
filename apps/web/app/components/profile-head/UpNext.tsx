"use client"
import { FC, useState } from 'react'
import useSWR from 'swr'
import type { Book } from '@prisma/client'
import { Loader2, Play } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { positionLabel, trackerGroups, type SeriesTrack } from '@/lib/series'
import type { DiscoverBook } from '@/lib/openLibrary'
import type { GenrePicks } from '@/lib/genrePicks'
import useBooks from '@/app/hooks/useBooks'
import useSettings from '@/app/hooks/useSettings'
import useBookEntryModal from '@/app/hooks/useBookEntryModal'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { reshelveBook } from '../books/ShelfMenuItems'
import { groupShelf } from '../books/shelf'
import BookCover from '../cards/BookCover'
import { SERIES_TRACKER_KEY } from '../series/FollowSeriesButton'

// Covers in the row: eight fill the books column on a wide screen; a phone swipes through them.
const MOST = 8

// One suggestion. On your shelf (`bookId`), Start moves it to Reading; off it, Start opens the add-book form on
// Reading, which asks where you're up to.
interface Pick {
  key: string
  title: string
  author: string
  coverUrl: string | null
  cardColour?: string | null
  tag: string
  bookId?: string
  discover?: DiscoverBook
}

const PickTile: FC<{ pick: Pick; row?: boolean }> = ({ pick, row = false }) => {
  const { mutate } = useBooks()
  const bookEntryModal = useBookEntryModal()
  const [starting, setStarting] = useState(false)
  const start = async () => {
    if (!pick.bookId) return pick.discover && bookEntryModal.onOpen(pick.discover, { shelf: "STARTED" })
    setStarting(true)
    if (await reshelveBook(pick.bookId, "STARTED")) notify.success(`Started ${pick.title}`)
    await mutate()
    refreshAfterBookChange()
    setStarting(false)
  }
  return (
    // Smaller than the Continue cards above, with a quiet Start, so what you're reading stays the loudest thing:
    // 96px wide on a phone (a row you swipe, the third cover peeking), 72px across eight columns from lg up.
    <li className={cn("flex w-24 shrink-0 snap-start flex-col", !row && "sm:w-auto")}>
      <BookCover book={{ title: pick.title, author: pick.author, coverImage: pick.coverUrl || "", cardColour: pick.cardColour ?? null }}
        variant="thumb" sizes="(min-width: 1024px) 72px, 96px" className="w-full shadow-sm" />
      {/* Two lines kept for every title, so a one-line title doesn't lift its Start above the rest of the row. */}
      <p className="mt-1.5 line-clamp-2 min-h-[2.75em] break-words text-xs font-medium leading-snug" title={pick.title}>{pick.title}</p>
      <p className="truncate text-[11px] leading-snug text-muted-foreground" title={pick.tag}>{pick.tag}</p>
      <button type="button" onClick={start} disabled={starting}
        className={cn(
          "mt-auto inline-flex items-center gap-1 rounded-md text-xs font-medium transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // A button you can hit with a thumb below lg; a quiet text button beside the Continue cards above it.
          "mt-2 h-11 w-full justify-center border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900",
          "lg:mt-auto lg:h-8 lg:w-auto lg:justify-start lg:-ml-1.5 lg:border-0 lg:px-1.5 lg:text-muted-foreground lg:hover:bg-transparent lg:hover:text-foreground",
        )}>
        {starting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={12} aria-hidden />}Start
        <span className="sr-only"> {pick.title}</span>
      </button>
    </li>
  )
}

// Under Continue reading on your profile in bands: what to start next, one tap each. The next book in a series
// you're reading or follow comes first (never one you put down), then your Want to read, newest first, then
// popular books in the genres you picked, until there are four to six.
// `bare`: no heading of its own, where the heading above already says Up next (nothing on the go, or the
// Update sheet after Finished). `row`: a row you swipe at every width, for somewhere narrow (that sheet).
const UpNext: FC<{ bare?: boolean; row?: boolean }> = ({ bare = false, row = false }) => {
  const { books } = useBooks()
  const { settings } = useSettings()
  const { data: series } = useSWR<{ series: SeriesTrack[] }>(SERIES_TRACKER_KEY, fetcher, swrOptions)
  const { data: genre } = useSWR<GenrePicks>('/api/discover/for-you', fetcher, swrOptions)
  if (!Array.isArray(books)) return null

  const picks: Pick[] = []
  const seen = new Set<string>()
  const add = (pick: Pick) => {
    const k = `${pick.title}|${pick.author}`.toLowerCase()
    if (seen.has(k) || picks.length >= MOST) return
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
      bookId: next.bookId ?? undefined,
      discover: { workKey: next.workKey, title: next.title, author: next.author, pages: null, coverUrl: next.coverUrl },
    })
  }
  for (const book of groupShelf(books as Book[]).wantToRead) {
    add({ key: book.id, title: book.title, author: book.author, coverUrl: book.coverImage, cardColour: book.cardColour, tag: "Want to read", bookId: book.id })
  }
  if (!settings?.hideShelfPicks) {
    const label = genre?.genres[0]?.label
    for (const book of genre?.books ?? []) {
      add({ key: `genre-${book.workKey ?? book.title}`, title: book.title, author: book.author, coverUrl: book.coverUrl, tag: label ? `For you · ${label}` : "For you", discover: book })
    }
  }
  if (picks.length === 0) return null

  return (
    <section aria-labelledby={bare ? undefined : "up-next"} aria-label={bare ? "Up next" : undefined} className={bare ? undefined : "mt-8"}>
      {!bare && <h2 id="up-next" className="mb-4 text-lg font-semibold">Up next</h2>}
      <ul className={cn(
        // Relative, so the Start buttons' screen-reader text stays inside the scroller instead of widening the page.
        "relative flex gap-3 overflow-x-auto snap-x pb-1 max-sm:-mx-4 max-sm:px-4",
        !row && "sm:grid sm:grid-cols-6 sm:overflow-visible lg:grid-cols-7 sm:max-lg:[&>li:nth-child(n+7)]:hidden lg:[&>li:nth-child(n+8)]:hidden",
      )}>
        {picks.map((pick) => <PickTile key={pick.key} pick={pick} row={row} />)}
      </ul>
    </section>
  )
}

export default UpNext
