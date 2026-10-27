"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import type { DiscoverBook } from '@/lib/openLibrary'
import { secondaryButtonClass } from '../profile-head/ProfileHeader'
import DiscoverBookCard from './DiscoverBookCard'
import { Skeleton } from '../ui/skeleton'

const PAGE_SIZE = 24
const GRID = "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8"

// Shaped like a row or two of DiscoverBookCards: cover, two-line title, author, shelf buttons.
export const GenreBooksSkeleton: FC<{ count?: number }> = ({ count = 12 }) => (
  <div className={GRID} aria-hidden>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex flex-col gap-2.5">
        <Skeleton className="aspect-[2/3] w-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="mt-0.5 h-3 w-1/2" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-8 flex-1 rounded-full" />
          <Skeleton className="size-8 rounded-full" />
        </div>
      </div>
    ))}
  </div>
)

const GenreBooks: FC<{ slug: string, initial: DiscoverBook[] }> = ({ slug, initial }) => {
  const [books, setBooks] = useState(initial)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE)
  const [failed, setFailed] = useState(false)

  const loadMore = () => {
    setIsLoading(true)
    setFailed(false)
    axios.get(`/api/discover/subjects/${slug}?offset=${books.length}`)
      .then((res) => {
        const next: DiscoverBook[] = res.data
        // Open Library pages can overlap, so drop works we're already showing.
        setBooks((current) => [...current, ...next.filter((b) => !current.some((c) => c.workKey && c.workKey === b.workKey))])
        setHasMore(next.length === PAGE_SIZE)
      })
      .catch(() => setFailed(true))
      .finally(() => setIsLoading(false))
  }

  if (books.length === 0) {
    return <p className="text-sm text-muted-foreground">We can&apos;t load these books right now. Try again in a minute.</p>
  }

  return (
    <div className="flex flex-col gap-8">
      <div className={GRID}>
        {books.map((book, i) => <DiscoverBookCard key={book.workKey ?? i} book={book} />)}
      </div>
      {(hasMore || failed) && (
        <div className="flex flex-col items-center gap-2">
          {failed && <p className="text-sm text-muted-foreground">Couldn&apos;t load more books.</p>}
          <button type="button" onClick={loadMore} disabled={isLoading} className={secondaryButtonClass}>
            {isLoading ? "Loading…" : failed ? "Try again" : "Show more"}
          </button>
        </div>
      )}
    </div>
  )
}

export default GenreBooks
