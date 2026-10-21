"use client"
import { FC } from 'react'
import Image from 'next/image'
import { isOpenLibraryCover } from '@/utils/helpers'

export interface BookSearchResult {
  title: string
  author: string
  pages: number | null
  coverUrl: string | null
}

interface BookSearchResultsProps {
  results: BookSearchResult[]
  isLoading: boolean
  onSelect: (result: BookSearchResult) => void
}

const BookSearchResults: FC<BookSearchResultsProps> = ({ results, isLoading, onSelect }) => {
  if (isLoading) return <p className="px-1 text-sm text-muted-foreground">Searching…</p>
  if (results.length === 0) return <p className="px-1 text-sm text-muted-foreground">No matches found.</p>

  return (
    <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-800">
      {results.map((result, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onSelect(result)}
            className="flex w-full items-center gap-3 p-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700 relative">
              {result.coverUrl && <Image src={result.coverUrl} alt="" fill sizes="44px" unoptimized={isOpenLibraryCover(result.coverUrl)} className="object-cover" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{result.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {result.author}{result.pages ? ` · ${result.pages} pages` : ""}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default BookSearchResults
