"use client"
import { FC, useEffect, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { isOpenLibraryCover, openLibraryThumb, warmCoverConnections } from '@/utils/helpers'
import type { DiscoverBook } from '@/lib/openLibrary'

export type BookSearchResult = DiscoverBook

interface BookSearchResultsProps {
  results: BookSearchResult[]
  isLoading: boolean
  onSelect: (result: BookSearchResult) => void
  // Set when the search request failed, so it isn't mistaken for "no matches".
  failed?: boolean
  onRetry?: () => void
}

// Open Library covers take a second or two to arrive, so the slot pulses until the image lands.
const CoverThumb: FC<{ url: string | null }> = ({ url }) => {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const src = url && openLibraryThumb(url)

  return (
    <div className={cn("h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700 relative", src && !loaded && !failed && "animate-pulse")}>
      {src && !failed && (
        <Image
          src={src}
          alt=""
          fill
          sizes="44px"
          loading="eager"
          unoptimized={isOpenLibraryCover(src)}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  )
}

export const SearchFailed: FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <p role="alert" className="px-1 text-sm text-muted-foreground">
    Couldn&apos;t reach the book catalogue.{" "}
    {onRetry && <button type="button" onClick={onRetry} className="font-medium text-foreground underline underline-offset-4">Try again</button>}
  </p>
)

const BookSearchResults: FC<BookSearchResultsProps> = ({ results, isLoading, onSelect, failed, onRetry }) => {
  useEffect(() => {
    if (isLoading) warmCoverConnections()
  }, [isLoading])

  if (isLoading) return <p className="px-1 text-sm text-muted-foreground">Searching…</p>
  if (failed) return <SearchFailed onRetry={onRetry} />
  if (results.length === 0) return <p className="px-1 text-sm text-muted-foreground">No matches found.</p>

  return (
    <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-800">
      {results.map((result, i) => (
                // Keyed by book so a new search's covers start in the loading state rather than inheriting a row's.
        <li key={`${result.workKey}-${i}`}>
          <button
            type="button"
            onClick={() => onSelect(result)}
            className="flex w-full items-center gap-3 p-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <CoverThumb url={result.coverUrl} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{result.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[result.author, result.year, result.pages && `${result.pages} pages`].filter(Boolean).join(" · ")}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default BookSearchResults
