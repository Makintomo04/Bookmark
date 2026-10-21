"use client"
import { FC, useEffect, useRef, useState } from 'react'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import axios from 'axios'
import { toast } from 'react-toastify'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { warmCoverConnections } from '@/utils/helpers'
import type { DiscoverBook } from '@/lib/openLibrary'
import useUser from '@/app/hooks/useUser'
import DiscoverBookCard from './DiscoverBookCard'

type Mode = "books" | "people"

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
  const [mode, setMode] = useState<Mode>("books")
  const [query, setQuery] = useState("")
  const [books, setBooks] = useState<DiscoverBook[]>([])
  const [people, setPeople] = useState<SearchUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [followState, setFollowState] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  // "Find people" links (e.g. from the empty "From people you follow" section) land on /discover?find=people.
  const find = useSearchParams()?.get("find")
  useEffect(() => {
    if (find !== "people") return
    setMode("people")
    inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
    inputRef.current?.focus({ preventScroll: true })
  }, [find])

  const q = query.trim()
  const isActive = q.length >= MIN_CHARS[mode]

  useEffect(() => {
    if (!isActive || (mode === "people" && !signedIn)) {
      setBooks([])
      setPeople([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    if (mode === "books") warmCoverConnections()
    const timeout = setTimeout(() => {
      const request = mode === "books"
        ? axios.get(`/api/books/search?q=${encodeURIComponent(q)}&limit=12`).then((res) => setBooks(res.data))
        : axios.get(`/api/users/search?q=${encodeURIComponent(q)}`).then((res) => setPeople(res.data))
      request.catch(() => {}).finally(() => setIsSearching(false))
    }, 400)
    return () => clearTimeout(timeout)
  }, [q, mode, isActive, signedIn])

  const handleFollow = (username: string, current: boolean) => {
    axios.post(`/api/users/${encodeURIComponent(username)}/follow`)
      .then((res) => {
        setFollowState((state) => ({ ...state, [username]: res.data.isFollowing }))
        toast.success(res.data.isFollowing ? `Following ${username}` : `Unfollowed ${username}`, { position: "bottom-center" })
      })
      .catch(() => toast.error(current ? "Couldn't unfollow. Try again." : "Couldn't follow. Try again.", { position: "bottom-center" }))
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
    } else if (mode === "books") {
      results = books.length === 0
        ? <p className="text-sm text-muted-foreground" aria-live="polite">No books match &ldquo;{q}&rdquo;. Try the title or the author&apos;s surname.</p>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8">
            {books.map((book, i) => <DiscoverBookCard key={book.workKey ?? i} book={book} />)}
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
                  <Link href={`/u/${person.username}`} className="flex items-center gap-3 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-[14px]" style={{ background: person.favColour || "#D92D2D", ...tierRingStyle(booksReadFor(person.username, booksReadOf(person))) }}>
                      <Image src={person.image || "/images/avatar.jpg"} alt="" fill sizes="40px" className="object-cover" />
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
            placeholder={mode === "books" ? "Search by title or author" : "Search readers by username"}
            aria-label={mode === "books" ? "Search for books" : "Search for readers"}
            autoComplete="off"
            className="h-12 w-full rounded-full border border-neutral-300 dark:border-input bg-background pl-11 pr-11 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground">
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* While searching, results replace the browse sections so the page doesn't get long and confusing. */}
      {isActive ? <section aria-label="Search results">{results}</section> : children}
    </div>
  )
}

export default DiscoverSearch
