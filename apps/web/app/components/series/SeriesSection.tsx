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
const SeriesSection: FC<SeriesSectionProps> = ({ track, workId, position, signedIn, returnTo, headingClassName }) => {
  const progress = track.started ? progressLabel(track) : null
  return (
    <section aria-labelledby={SERIES_SECTION_ID} className="flex flex-col gap-4 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={SERIES_SECTION_ID} className={headingClassName}>In this series</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href={seriesHref(track.name, track.author)} className="hover:text-foreground hover:underline underline-offset-2">{track.name}</Link>{progress && <> · <span className="tabular-nums">{track.finished ? "All read" : progress}</span></>}
          </p>
        </div>
        <FollowSeriesButton
          name={track.name}
          author={track.author}
          initialFollowing={track.following}
          signedIn={signedIn}
          returnTo={returnTo}
          variant="text"
          className="shrink-0"
        />
      </div>
      <SeriesRow label={`Books in ${track.name}`}>
        {track.entries.map((entry) => {
          const isHere = isPageBook(entry, { workId, position })
          const href = isHere ? null : bookHref({ workKey: entry.workKey, pageWorkId: entry.pageWorkId, title: entry.title })
          const state = entryState(entry, track, isHere)
          const cover = (
            <BookCover
              book={{ title: entry.title, author: entry.author, coverImage: entry.coverUrl || "", cardColour: null }}
              sizes="112px"
              variant="thumb"
              className={cn(isHere && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
            />
          )
          return (
            <li key={entry.workId} aria-current={isHere ? "page" : undefined} className="w-28 shrink-0 snap-start flex flex-col gap-2">
              {href ? <Link href={href} tabIndex={-1} aria-hidden>{cover}</Link> : cover}
              <div className="min-w-0">
                {entry.position != null && <p className="text-xs text-muted-foreground">{positionLabel(entry.position)}</p>}
                {href
                  ? <Link href={href} className="block text-sm font-medium leading-snug line-clamp-2 hover:underline underline-offset-2">{entry.title}</Link>
                  : <p className="text-sm font-medium leading-snug line-clamp-2">{entry.title}</p>}
                {state && <p className={cn("mt-0.5 text-xs", isHere || state === "Up next" ? "text-foreground" : "text-muted-foreground")}>{state}</p>}
              </div>
            </li>
          )
        })}
      </SeriesRow>
      {!track.started && !track.following && (
        <p className="text-sm text-muted-foreground">Follow it to keep it in your series tracker before you&apos;ve started.</p>
      )}
    </section>
  )
}

export default SeriesSection
