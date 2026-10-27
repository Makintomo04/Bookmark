"use client"
import { FC, useEffect, useRef, useState } from 'react'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import Image from 'next/image'
import InitialAvatar from '@/app/components/profile/InitialAvatar'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import axios from 'axios'
import { notify } from '@/lib/notify'
import { History, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { warmCoverConnections } from '@/utils/helpers'
import useUser from '@/app/hooks/useUser'
import useBookSearch from '@/app/hooks/useBookSearch'
import DiscoverBookCard from './DiscoverBookCard'
import BookCover from '../cards/BookCover'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import useSearchHistory, { historyEntryId, SearchHistoryEntry, SearchMode } from '@/app/hooks/useSearchHistory'
import { bookHref } from '@/lib/workKey'
import type { DiscoverBook } from '@/lib/openLibrary'

type Mode = SearchMode

interface SearchUser {
  username: string
  image: string | null
  favColour: string | null
  bio: string | null
  isFollowing: boolean
  _count?: { books?: number }
}

const MIN_CHARS: Record<Mode, number> = { books: 3, people: 2 }

const DiscoverSearch: FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user } = useUser()
  const booksReadFor = useBooksReadFor()
  const signedIn = !!user?.id
  const searchParams = useSearchParams()
  const urlQuery = searchParams?.get("q") ?? ""
  // "Find people" links (e.g. from the empty "From people you follow" section) land on /discover?find=people.
  const find = searchParams?.get("find")
  const [mode, setMode] = useState<Mode>(searchParams?.get("mode") === "people" || find === "people" ? "people" : "books")
  const [query, setQuery] = useState(urlQuery)
  const [people, setPeople] = useState<SearchUser[]>([])
  const [isSearchingPeople, setIsSearchingPeople] = useState(false)
  const [peopleFailed, setPeopleFailed] = useState(false)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [followState, setFollowState] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const history = useSearchHistory()
  const addToHistory = history.add
  const openDetails = useBookDetailsModal((s) => s.onOpen)

  useEffect(() => {
    if (find !== "people") return
    setMode("people")
    inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
    inputRef.current?.focus({ preventScroll: true })
  }, [find])

  const q = query.trim()
  const isActive = q.length >= MIN_CHARS[mode]

  // The search lives in the URL, so Back from a book's page (or a reload) lands on the same results. It's
  // replaced rather than pushed, so typing doesn't fill the history, and without a router round trip.
  const writtenQuery = useRef(urlQuery)
  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(window.location.search)
      if (q) params.set("q", q)
      else params.delete("q")
      if (mode === "people") params.set("mode", "people")
      else params.delete("mode")
      params.delete("find")
      const search = params.toString()
      writtenQuery.current = q
      if (search !== window.location.search.slice(1)) {
        window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`)
      }
    }, 300)
    return () => clearTimeout(timeout)
  }, [q, mode])

  // The URL changed under us (e.g. the header's Discover link while already here): follow it.
  useEffect(() => {
    if (urlQuery === writtenQuery.current) return
    writtenQuery.current = urlQuery
    setQuery(urlQuery)
  }, [urlQuery])

  const bookSearch = useBookSearch(q, { enabled: mode === "books", limit: 12, attempt: searchAttempt })
  const books = bookSearch.results
  const isSearching = mode === "books" ? bookSearch.isSearching : isSearchingPeople
  const searchFailed = mode === "books" ? bookSearch.searchFailed : peopleFailed

  // A search is remembered once the reader has settled on it: they pressed Enter, opened a result, or
  // stopped typing with results on screen.
  const hasResults = mode === "books" ? books.length > 0 : people.length > 0
  const rememberSearch = () => { if (isActive) addToHistory({ kind: "query", q, mode }) }
  useEffect(() => {
    if (!isActive || isSearching || !hasResults) return
    const timeout = setTimeout(() => addToHistory({ kind: "query", q, mode }), 1500)
    return () => clearTimeout(timeout)
  }, [q, mode, isActive, isSearching, hasResults, addToHistory])

  const openRecent = (entry: SearchHistoryEntry) => {
    addToHistory(entry)
    if (entry.kind === "book") return
    setMode(entry.mode)
    setQuery(entry.q)
  }

  useEffect(() => {
    if (mode === "books" && isActive) warmCoverConnections()
  }, [mode, isActive])

  useEffect(() => {
    if (mode !== "people" || !isActive || !signedIn) {
      setPeople([])
      setIsSearchingPeople(false)
      setPeopleFailed(false)
      return
    }
    // A slower earlier search must not overwrite the results for what's typed now.
    let current = true
    setIsSearchingPeople(true)
    setPeopleFailed(false)
    const timeout = setTimeout(() => {
      axios.get(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((res) => { if (current) setPeople(res.data) })
        .catch(() => { if (current) { setPeople([]); setPeopleFailed(true) } })
        .finally(() => { if (current) setIsSearchingPeople(false) })
    }, 400)
    return () => { current = false; clearTimeout(timeout) }
  }, [q, mode, isActive, signedIn, searchAttempt])

  const handleFollow = (username: string, current: boolean) => {
    axios.post(`/api/users/${encodeURIComponent(username)}/follow`)
      .then((res) => {
        setFollowState((state) => ({ ...state, [username]: res.data.isFollowing }))
      })
      .catch(() => notify.error(current ? "Couldn't unfollow. Try again." : "Couldn't follow. Try again.", { retry: () => handleFollow(username, current) }))
  }

  const tabs = (
    <div role="tablist" aria-label="Search for" className="inline-flex self-start rounded-full bg-neutral-100 dark:bg-neutral-900 p-1">
      {(["books", "people"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => setMode(m)}
          className={cn(
            "h-8 px-4 rounded-full text-sm font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mode === m ? "bg-background dark:bg-neutral-700 shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m}
        </button>
      ))}
    </div>
  )

  let results: React.ReactNode = null
  if (isActive) {
    if (mode === "people" && !signedIn) {
      results = <p className="text-sm text-muted-foreground"><Link href="/signin" className="font-medium text-foreground underline underline-offset-4">Sign in</Link> to find readers.</p>
    } else if (isSearching) {
      results = <p className="text-sm text-muted-foreground" aria-live="polite">Searching…</p>
    } else if (searchFailed) {
      results = (
        <p role="alert" className="text-sm text-muted-foreground">
          {mode === "books" ? "Couldn't reach the book catalogue." : "Couldn't search for readers."}{" "}
          <button type="button" onClick={() => setSearchAttempt((n) => n + 1)} className="font-medium text-foreground underline underline-offset-4">Try again</button>
        </p>
      )
    } else if (mode === "books") {
      results = books.length === 0
        ? <p className="text-sm text-muted-foreground" aria-live="polite">No books match &ldquo;{q}&rdquo;. Try the title or the author&apos;s surname.</p>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8">
            {books.map((book, i) => (
              <DiscoverBookCard
                key={book.workKey ?? i}
                book={book}
                onOpen={() => { rememberSearch(); addToHistory({ kind: "book", book }) }}
              />
            ))}
          </div>
        )
    } else {
      results = people.length === 0
        ? <p className="text-sm text-muted-foreground" aria-live="polite">No readers called &ldquo;{q}&rdquo;.</p>
        : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {people.map((person) => {
              const following = followState[person.username] ?? person.isFollowing
              return (
                <li key={person.username} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
                  <Link href={`/u/${person.username}`} onClick={rememberSearch} className="flex items-center gap-3 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-[14px]" style={{ background: person.favColour || "#D92D2D", ...tierRingStyle(booksReadFor(person.username, booksReadOf(person))) }}>
                      {person.image
                        ? <Image src={person.image} alt="" fill sizes="40px" className="object-cover" />
                        : <InitialAvatar username={person.username} favColour={person.favColour} />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{person.username}</p>
                      {person.bio && <p className="truncate text-xs text-muted-foreground">{person.bio}</p>}
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleFollow(person.username, following)}
                    className={cn(
                      "shrink-0 h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      following ? "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900" : "bg-foreground text-background hover:opacity-90"
                    )}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                </li>
              )
            })}
          </ul>
        )
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        {tabs}
        <div className="relative max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") rememberSearch() }}
            placeholder={mode === "books" ? "Search by title or author" : "Search readers by username"}
            aria-label={mode === "books" ? "Search for books" : "Search for readers"}
            autoComplete="off"
            className="h-12 w-full rounded-full border border-input bg-background pl-11 pr-11 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground">
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
        {!isActive && history.entries.length > 0 && (
          <RecentSearches entries={history.entries} onOpen={openRecent} onOpenBook={openDetails} onRemove={history.remove} onClear={history.clear} />
        )}
      </div>

      {/* While searching, results replace the browse sections so the page doesn't get long and confusing. */}
      {isActive ? <section aria-label="Search results">{results}</section> : children}
    </div>
  )
}

interface RecentSearchesProps {
  entries: SearchHistoryEntry[]
  onOpen: (entry: SearchHistoryEntry) => void
  onOpenBook: (book: DiscoverBook) => void
  onRemove: (entry: SearchHistoryEntry) => void
  onClear: () => void
}

// Recent searches and the books opened from them, under the box. A book goes straight to its page; one
// without a page yet (a Hardcover hit no one has shelved) opens its details instead.
const RecentSearches: FC<RecentSearchesProps> = ({ entries, onOpen, onOpenBook, onRemove, onClear }) => {
  const chip = "flex min-w-0 items-center gap-2 h-8 pl-3 pr-1 text-sm rounded-l-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <section aria-labelledby="recent-searches-heading" className="flex max-w-2xl flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <h2 id="recent-searches-heading" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent</h2>
        <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
          Clear
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {entries.map((entry) => {
          const label = entry.kind === "query" ? entry.q : entry.book.title
          const href = entry.kind === "book" ? bookHref(entry.book) : null
          const content = entry.kind === "query" ? (
            <>
              <History size={14} className="shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{entry.q}</span>
              {entry.mode === "people" && <span className="shrink-0 text-xs text-muted-foreground">in people</span>}
            </>
          ) : (
            <>
              <BookCover
                book={{ title: entry.book.title, author: entry.book.author, coverImage: entry.book.coverUrl || "", cardColour: null }}
                sizes="16px"
                variant="thumb"
                className="w-4 shrink-0 rounded-[2px]"
              />
              <span className="truncate">{entry.book.title}</span>
            </>
          )
          return (
            <li key={historyEntryId(entry)} className="flex max-w-full items-center rounded-full border border-neutral-200 dark:border-neutral-800 transition hover:bg-neutral-50 dark:hover:bg-neutral-900">
              {href ? (
                <Link href={href} onClick={() => onOpen(entry)} className={chip}>{content}</Link>
              ) : (
                <button
                  type="button"
                  onClick={() => { onOpen(entry); if (entry.kind === "book") onOpenBook(entry.book) }}
                  className={chip}
                >
                  {content}
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(entry)}
                aria-label={`Remove ${label} from recent searches`}
                className="mr-0.5 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default DiscoverSearch
