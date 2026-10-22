import { useEffect, useState } from 'react'
import axios from 'axios'
import type { DiscoverBook } from '@/lib/openLibrary'

// Shelf matches are cheap, so they go out almost at once; the full search (which asks Open Library) waits
// for a pause in typing.
const SHELVES_DELAY = 150
const FULL_DELAY = 400

interface Options {
  enabled: boolean
  limit?: 6 | 12
  // Bump to retry after a failure.
  attempt?: number
}

const bookId = (b: DiscoverBook) => b.workKey || `${b.title}|${b.author}`.toLowerCase()

// Rows already on screen keep their place (the reader may be about to click one); the full search only
// fills in their details and adds what's new below them.
function settle(shown: DiscoverBook[], full: DiscoverBook[], limit: number) {
  const fresh = new Map(full.map((b) => [bookId(b), b]))
  const kept = shown.map((b) => fresh.get(bookId(b)) ?? b)
  const keptIds = new Set(kept.map(bookId))
  return [...kept, ...full.filter((b) => !keptIds.has(bookId(b)))].slice(0, Math.max(limit, kept.length))
}

// Book search for the search boxes: books already on Bookmark's shelves show first, then Open Library's
// answer is added beneath them. `isSearching` stays true only while there's nothing to show.
export default function useBookSearch(query: string, { enabled, limit = 6, attempt = 0 }: Options) {
  const [results, setResults] = useState<DiscoverBook[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const q = query.trim()

  useEffect(() => {
    if (!enabled || q.length < 3) {
      setResults([])
      setIsSearching(false)
      setSearchFailed(false)
      return
    }
    // A slower earlier search must not overwrite the results for what's typed now.
    let current = true
    let fullDone = false
    let shown: DiscoverBook[] = []
    setResults([])
    setIsSearching(true)
    setSearchFailed(false)
    const url = `/api/books/search?q=${encodeURIComponent(q)}&limit=${limit}`

    const shelves = setTimeout(() => {
      axios.get(`${url}&source=shelves`)
        .then((res) => {
          if (!current || fullDone || !Array.isArray(res.data) || res.data.length === 0) return
          shown = res.data
          setResults(res.data)
          setIsSearching(false)
        })
        .catch(() => {})
    }, SHELVES_DELAY)

    const full = setTimeout(() => {
      axios.get(url)
        .then((res) => { fullDone = true; if (current) setResults(Array.isArray(res.data) ? settle(shown, res.data, limit) : shown) })
        // Shelf matches already on screen are better than an error.
        .catch(() => { fullDone = true; if (current && shown.length === 0) { setResults([]); setSearchFailed(true) } })
        .finally(() => { if (current) setIsSearching(false) })
    }, FULL_DELAY)

    return () => { current = false; clearTimeout(shelves); clearTimeout(full) }
  }, [q, enabled, limit, attempt])

  return { results, isSearching, searchFailed }
}
