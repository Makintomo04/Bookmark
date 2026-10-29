import { useCallback, useEffect, useState } from 'react'
import type { DiscoverBook } from '@/lib/openLibrary'

// Recent Discover searches, and books opened from them, kept on this device only: a convenience for getting
// back to a search, not something worth an account round trip.
export type SearchHistoryEntry =
  | { kind: "query"; q: string }
  | { kind: "book"; book: DiscoverBook }

const KEY = "bookmark:search-history"
// Enough to get back to what was just looked at without the chips running to a third line.
const MAX = 6
// Every tab on the page shares one list.
const CHANGED = "bookmark:search-history-changed"

const bookId = (b: DiscoverBook) => b.workKey || `${b.title}|${b.author}`.toLowerCase()

function read(): SearchHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]")
    if (!Array.isArray(parsed)) return []
    // Lists saved before books and people shared one box can hold the same words twice, once per tab.
    const seen = new Set<string>()
    return parsed
      .map((e): SearchHistoryEntry => (e?.kind === "query" ? { kind: "query", q: e.q } : e))
      .filter((e) => {
        const id = historyEntryId(e)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      .slice(0, MAX)
  } catch {
    return []
  }
}

function write(entries: SearchHistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {}
  window.dispatchEvent(new Event(CHANGED))
}

// The same search (or a shorter one it grew from, left by a pause in typing) is replaced, not repeated.
function supersedes(entry: SearchHistoryEntry, next: SearchHistoryEntry) {
  if (entry.kind !== next.kind) return false
  if (entry.kind === "book" && next.kind === "book") return bookId(entry.book) === bookId(next.book)
  if (entry.kind === "query" && next.kind === "query") {
    return next.q.toLowerCase().startsWith(entry.q.toLowerCase())
  }
  return false
}

export function historyEntryId(entry: SearchHistoryEntry) {
  return entry.kind === "query" ? `q:${entry.q.toLowerCase()}` : `b:${bookId(entry.book)}`
}

export default function useSearchHistory() {
  // Read after mounting, so the server render and the first client render agree.
  const [entries, setEntries] = useState<SearchHistoryEntry[]>([])

  useEffect(() => {
    const sync = () => setEntries(read())
    sync()
    window.addEventListener(CHANGED, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGED, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const add = useCallback((entry: SearchHistoryEntry) => {
    if (entry.kind === "query" && !entry.q.trim()) return
    const clean: SearchHistoryEntry = entry.kind === "query"
      ? { kind: "query", q: entry.q.trim() }
      // The blurb can be long and is fetched again when the details open.
      : { kind: "book", book: { ...entry.book, description: entry.book.source === "hardcover" ? entry.book.description : undefined } }
    write([clean, ...read().filter((e) => !supersedes(e, clean))].slice(0, MAX))
  }, [])

  const remove = useCallback((entry: SearchHistoryEntry) => {
    const id = historyEntryId(entry)
    write(read().filter((e) => historyEntryId(e) !== id))
  }, [])

  const clear = useCallback(() => write([]), [])

  return { entries, add, remove, clear }
}
