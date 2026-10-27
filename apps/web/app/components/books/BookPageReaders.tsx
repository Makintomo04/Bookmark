"use client"
import { FC } from 'react'
import type { DiscoverBook } from '@/lib/openLibrary'
import useWorkTags from '@/app/hooks/useWorkTags'
import ReaderCounts from './ReaderCounts'
import { WorkTagsSummary } from './WorkTags'
import PickedByFollowing from '../lists/PickedByFollowing'

// The book page's view of other readers that depends on who's looking: how many are reading it, moods
// and warnings, and anyone the viewer follows who picked it. Each part renders nothing when empty.
const BookPageReaders: FC<{ book: DiscoverBook, bookKey: string }> = ({ book, bookKey }) => {
  const { tags } = useWorkTags({ bookKey })
  return (
    <div className="flex flex-col gap-6 empty:hidden">
      <ReaderCounts bookKey={bookKey} />
      <WorkTagsSummary tags={tags} />
      <PickedByFollowing book={book} />
    </div>
  )
}

export default BookPageReaders
