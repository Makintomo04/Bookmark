import { FC } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { bookHref } from '@/lib/workKey'
import { entryState, isPageBook, positionLabel, progressLabel, seriesHref, seriesPlaceLabel, type SeriesTrack } from '@/lib/series'
import BookCover from '../cards/BookCover'
import FollowSeriesButton from './FollowSeriesButton'
import SeriesRow from './SeriesRow'

interface SeriesSectionProps {
  track: SeriesTrack
  // The page's own book: its work, and its place in case the series lists another copy of it there.
  workId: string | null
  position: number | null
  signedIn: boolean
  returnTo: string
  headingClassName: string
  // Small covers and no Follow series, for a glance at where this book falls before starting it.
  compact?: boolean
}

export const SERIES_SECTION_ID = "series-heading"

// "Book 2 of The Empyrean" above the title, linking down to the section.
export const SeriesEyebrow: FC<{ name: string, position: number | null }> = ({ name, position }) => (
  <a href={`#${SERIES_SECTION_ID}`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
    {seriesPlaceLabel(name, position)}
  </a>
)

// "In this series" on a book page: the series' books in order, with the viewer's place in it and Follow
// series. A row to swipe through, since a long series runs past the page's width.
const SeriesSection: FC<SeriesSectionProps> = ({ track, workId, position, signedIn, returnTo, headingClassName, compact = false }) => {
  const progress = track.started ? progressLabel(track) : null
  return (
    <section aria-labelledby={SERIES_SECTION_ID} className={cn("flex flex-col scroll-mt-24", compact ? "gap-2" : "gap-4")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={SERIES_SECTION_ID} className={headingClassName}>In this series</h2>
          <p className={cn("text-sm text-muted-foreground", !compact && "mt-1")}>
            <Link href={seriesHref(track.name, track.author)} className="hover:text-foreground hover:underline underline-offset-2">{track.name}</Link>{progress && <> · <span className="tabular-nums">{track.finished ? "All read" : progress}</span></>}
          </p>
        </div>
        {!compact && <FollowSeriesButton
          name={track.name}
          author={track.author}
          initialFollowing={track.following}
          signedIn={signedIn}
          returnTo={returnTo}
          variant="text"
          className="shrink-0"
        />}
      </div>
      <SeriesRow label={`Books in ${track.name}`} compact={compact}>
        {track.entries.map((entry) => {
          const isHere = isPageBook(entry, { workId, position })
          const href = isHere ? null : bookHref({ workKey: entry.workKey, pageWorkId: entry.pageWorkId, title: entry.title })
          const state = entryState(entry, track, isHere)
          const cover = (
            <BookCover
              book={{ title: entry.title, author: entry.author, coverImage: entry.coverUrl || "", cardColour: null }}
              sizes={compact ? "64px" : "112px"}
              variant="thumb"
              className={cn(isHere && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
            />
          )
          return (
            <li key={entry.workId} aria-current={isHere ? "page" : undefined} className={cn("shrink-0 snap-start flex flex-col", compact ? "w-16 gap-1.5" : "w-28 gap-2")}>
              {href ? <Link href={href} tabIndex={-1} aria-hidden>{cover}</Link> : cover}
              <div className="min-w-0">
                {entry.position != null && <p className="text-xs text-muted-foreground">{positionLabel(entry.position)}</p>}
                {href
                  ? <Link href={href} className={cn("block font-medium leading-snug line-clamp-2", compact ? "text-xs" : "text-sm", "hover:underline underline-offset-2")}>{entry.title}</Link>
                  : <p className={cn("font-medium leading-snug line-clamp-2", compact ? "text-xs" : "text-sm")}>{entry.title}</p>}
                {state && <p className={cn("mt-0.5 text-xs", isHere || state === "Up next" ? "text-foreground" : "text-muted-foreground")}>{state}</p>}
              </div>
            </li>
          )
        })}
      </SeriesRow>
      {!compact && !track.started && !track.following && (
        <p className="text-sm text-muted-foreground">Follow it to keep it in your series tracker before you&apos;ve started.</p>
      )}
    </section>
  )
}

export default SeriesSection
