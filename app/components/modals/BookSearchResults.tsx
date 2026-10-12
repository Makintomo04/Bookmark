"use client"
import { FC } from 'react'
import Image from 'next/image'

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
  if (!isLoading && results.length === 0) return null

  return (
    <div className="absolute z-20 mt-1 w-full max-w-lg max-h-64 overflow-y-auto rounded-md border border-neutral-700 bg-background shadow-lg">
      {isLoading ? (
        <div className="p-3 text-sm text-muted-foreground">Searching...</div>
      ) : (
        results.map((result, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(result)}
            className="flex w-full items-center gap-3 p-2 text-left hover:bg-neutral-800 transition"
          >
            <div className="h-12 w-8 flex-shrink-0 overflow-hidden rounded bg-neutral-700 relative">
              {result.coverUrl && <Image src={result.coverUrl} alt="" fill className="object-cover" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{result.title}</p>
              <p className="truncate text-xs text-muted-foreground">{result.author}</p>
            </div>
          </button>
        ))
      )}
    </div>
  )
}

export default BookSearchResults
