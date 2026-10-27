"use client"
import { FC, ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { cn } from '@/lib/utils'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { bookHref } from '@/lib/workKey'
import { positionLabel, progressLabel, trackerGroups, type SeriesEntry, type SeriesTrack } from '@/lib/series'
import useBooks from '@/app/hooks/useBooks'
import BookCover from '../cards/BookCover'
import AddToShelfButton from '../discover/AddToShelfButton'
import { SHELF_PREVIEW, SeeAllLink, ShelfSection, coverGridClass } from '../books/shelf'
import { pillClass } from '../books/ShelfToolbar'
import AuthorLink from '@/app/components/AuthorLink'
import { SERIES_TRACKER_KEY } from './FollowSeriesButton'

type Tab = 'nextUp' | 'started' | 'unfinished'
const TABS: { id: Tab, label: string }[] = [
  { id: 'nextUp', label: 'Next up' },
  { id: 'started', label: 'Started' },
  { id: 'unfinished', label: 'Not finished' },
]

const EMPTY: Record<Tab, string> = {
  nextUp: "Nothing next yet. Finish a book in a series, or follow one from a book's page.",
  started: "Start a book in a series and it'll show here.",
  unfinished: "You've finished every series you've started.",
}

const EntryLink: FC<{ entry: SeriesEntry, className?: string, children: ReactNode }> = ({ entry, className, children }) => {
  const href = bookHref({ workKey: entry.workKey, pageWorkId: entry.pageWorkId, title: entry.title })
  return href ? <Link href={href} className={cn("hover:underline underline-offset-2", className)}>{children}</Link> : <span className={className}>{children}</span>
}

// The next book of one series, laid out like a cover on the shelf: the book number on the cover, then title,
// author and series. The button sits at the foot of the card, so a row's buttons line up whatever the titles.
const NextCard: FC<{ track: SeriesTrack }> = ({ track }) => {
  const entry = track.next!
  const href = bookHref({ workKey: entry.workKey, pageWorkId: entry.pageWorkId, title: entry.title })
  const position = positionLabel(entry.position)
  const cover = (
    <div className="relative">
      <BookCover book={{ title: entry.title, author: entry.author, coverImage: entry.coverUrl || "", cardColour: null }} sizes="(min-width: 1280px) 180px, (min-width: 640px) 25vw, 45vw" />
      {position && (
        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
          {position}
        </span>
      )}
    </div>
  )
  return (
    <li className="flex flex-col gap-3 min-w-0">
      {href ? <Link href={href} tabIndex={-1} aria-hidden className="transition md:hover:-translate-y-0.5 md:hover:opacity-90">{cover}</Link> : cover}
      <div className="min-w-0">
        <EntryLink entry={entry} className="block text-[15px] font-semibold leading-snug line-clamp-2">
          {position && <span className="sr-only">{position}: </span>}{entry.title}
        </EntryLink>
        <p className="mt-0.5 text-sm text-muted-foreground truncate"><AuthorLink author={entry.author} /></p>
        <p title={track.name} className="mt-1 text-xs text-muted-foreground truncate">{track.name}</p>
      </div>
      <div className="mt-auto">
        {entry.status === "STARTED"
          ? <p className="text-xs font-medium">Reading now</p>
          : <AddToShelfButton book={{ workKey: entry.workKey, title: entry.title, author: entry.author, pages: null, coverUrl: entry.coverUrl }} />}
      </div>
    </li>
  )
}

// One series as a row: how far through, a mark per book in order, and what's next.
const SeriesRow: FC<{ track: SeriesTrack }> = ({ track }) => {
  const progress = progressLabel(track)
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium">{track.name} <span className="text-sm font-normal text-muted-foreground">by {track.author}</span></p>
        {progress && <p className="text-sm text-muted-foreground tabular-nums">{track.finished ? "All read" : progress}</p>}
      </div>
      <ol aria-label={`Books in ${track.name}`} className="flex flex-wrap gap-1">
        {track.entries.map((e) => (
          <li key={e.workId}>
            <EntryLink
              entry={e}
              className={cn(
                "block h-2 rounded-full",
                e.position !== null && !Number.isInteger(e.position) ? "w-3" : "w-6",
                e.read ? "bg-foreground" : e.status === "STARTED" ? "bg-neutral-500" : "bg-neutral-300 dark:bg-neutral-700",
              )}
            >
              <span className="sr-only">{[positionLabel(e.position), e.title, e.read ? "read" : e.status === "STARTED" ? "reading" : "not read"].filter(Boolean).join(", ")}</span>
            </EntryLink>
          </li>
        ))}
      </ol>
      {track.next && (
        <p className="text-sm text-muted-foreground">
          {track.next.status === "STARTED" ? "Reading" : "Next"}: <EntryLink entry={track.next} className="text-foreground">{track.next.title}</EntryLink>
          {track.next.position !== null && <> ({positionLabel(track.next.position)})</>}
        </p>
      )}
    </li>
  )
}

// The series tracker on your shelf: the next book in each series, the series you've started, and the
// ones you haven't finished. Free for everyone.
const SeriesTracker: FC = () => {
  const { data, mutate } = useSWR<{ series: SeriesTrack[] }>(SERIES_TRACKER_KEY, fetcher, swrOptions)
  const { books } = useBooks()
  const [tab, setTab] = useState<Tab>('nextUp')
  // Two rows of covers (or a handful of series) until "See all", so lists and authors below stay close.
  const [all, setAll] = useState(false)

  // A book moved between shelves changes what's next.
  useEffect(() => { if (books) void mutate() }, [books, mutate])

  if (!data) return null
  const groups = trackerGroups(data.series)
  const shown = groups[tab]
  const cap = tab === 'nextUp' ? SHELF_PREVIEW : 6
  const visible = all ? shown : shown.slice(0, cap)

  return (
    <ShelfSection id="series-tracker" title="Series" count={data.series.length}
      action={!all && shown.length > cap ? <SeeAllLink onClick={() => setAll(true)} /> : undefined}>
      {data.series.length === 0 ? (
        <p className="text-sm text-muted-foreground">Start a book in a series, or follow one from a book&apos;s page, and you&apos;ll see what&apos;s next here.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Series" className="mb-6 inline-flex rounded-full border border-neutral-300 dark:border-neutral-700 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`series-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="series-panel"
                onClick={() => { setTab(t.id); setAll(false) }}
                className={cn(
                  "h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === t.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label} <span className="tabular-nums opacity-70">{groups[t.id].length}</span>
              </button>
            ))}
          </div>
          <div id="series-panel" role="tabpanel" aria-labelledby={`series-tab-${tab}`}>
            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">{EMPTY[tab]}</p>
            ) : tab === 'nextUp' ? (
              <ul className={coverGridClass}>{visible.map((t) => <NextCard key={t.key} track={t} />)}</ul>
            ) : (
              <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800 max-w-3xl">{visible.map((t) => <SeriesRow key={t.key} track={t} />)}</ul>
            )}
            {shown.length > cap && (
              <div className="mt-6 flex justify-center">
                <button type="button" onClick={() => setAll((v) => !v)} className={pillClass}>
                  {all ? "Show fewer" : `See all ${shown.length}`}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </ShelfSection>
  )
}

export default SeriesTracker
