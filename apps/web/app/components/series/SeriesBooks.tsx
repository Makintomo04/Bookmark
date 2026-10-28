import { FC } from 'react'
import Link from 'next/link'
import { bookHref } from '@/lib/workKey'
import { positionLabel, type SeriesTrack } from '@/lib/series'
import BookCover from '../cards/BookCover'
import AddToShelfButton from '../discover/AddToShelfButton'

// A series page's books, top to bottom in reading order, each with its shelf button (which already says
// where the reader has it). Only "Up next" is said here, since the button can't know it.
const SeriesBooks: FC<{ track: SeriesTrack }> = ({ track }) => (
  <ol aria-label={`Books in ${track.name}, in reading order`} className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
    {track.entries.map((entry) => {
      const href = bookHref({ workKey: entry.workKey, pageWorkId: entry.pageWorkId, title: entry.title })
      const upNext = track.started && track.next?.workId === entry.workId && entry.status !== "STARTED"
      const cover = (
        <BookCover
          book={{ title: entry.title, author: entry.author, coverImage: entry.coverUrl || "", cardColour: null }}
          sizes="64px"
          variant="thumb"
        />
      )
      return (
        <li key={entry.workId} className="flex items-center gap-4 py-4">
          <div className="w-16 shrink-0">
            {href ? <Link href={href} tabIndex={-1} aria-hidden>{cover}</Link> : cover}
          </div>
          <div className="min-w-0 flex-1">
            {entry.position != null && <p className="text-xs text-muted-foreground">{positionLabel(entry.position)}</p>}
            {href
              ? <Link href={href} className="block font-medium leading-snug line-clamp-2 hover:underline underline-offset-2">{entry.title}</Link>
              : <p className="font-medium leading-snug line-clamp-2">{entry.title}</p>}
            {upNext && <p className="mt-0.5 text-xs font-medium">Up next</p>}
          </div>
          <AddToShelfButton
            book={{ workKey: entry.workKey, title: entry.title, author: entry.author, pages: null, coverUrl: entry.coverUrl }}
            className="shrink-0"
          />
        </li>
      )
    })}
  </ol>
)

export default SeriesBooks
