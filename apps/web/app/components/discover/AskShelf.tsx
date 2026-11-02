"use client"
import { FC, FormEvent, useEffect, useState } from 'react'
import axios from 'axios'
import { BookCheck, ListPlus, Loader2, Feather, Star, AlertTriangle, Users, Search } from 'lucide-react'
import Link from 'next/link'
import { shelfParams, shelfQuestion, type ShelfFilter } from '@/lib/shelfFilter'
import { GENRES } from '@/lib/genres'
import { apiError, notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { isUpgradeRequired } from '@/lib/entitlements'
import { preferencesOf } from '@/lib/preferences'
import { MOOD_LABEL, SPICE_LABEL, SPICE_MAX, WARNING_LEVEL_LABEL, spiceRangeText } from '@/lib/workTags'
import { ASK_QUERY_MAX, type AskResult, type AskShelfResponse, type FriendSignal, type ShelfIntent } from '@/lib/askShelf'
import type { AllowanceStatus } from '@/lib/ai/usage'
import useUser from '@/app/hooks/useUser'
import useListEditorModal, { emptyList } from '@/app/hooks/useListEditorModal'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import { CuratorAvatar } from '../lists/CuratorNote'
import UpgradePrompt from '../plus/UpgradePrompt'
import DiscoverBookCard from './DiscoverBookCard'
import { SpiceFlames } from '../books/WorkTags'
import { can } from '@/lib/roles'

const EXAMPLES = [
  "Cosy and low-stakes, after a heavy week",
  "Strong female lead, fantasy, under 400 pages, no sexual violence",
  "A slow-burn romance with a happy ending",
]

const formatRating = (rating: number) => (Number.isInteger(rating) ? String(rating) : rating.toFixed(1))

// Marks every piece of text the model wrote. The strategy's rule: AI is always labelled.
export const AiLabel: FC<{ className?: string }> = ({ className }) => (
  <span className={cn("inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-700 px-1.5 py-0.5 text-xs font-medium text-muted-foreground", className)}>
    <Feather size={10} aria-hidden />AI
  </span>
)

const names = (people: { username: string | null }[]) => people.map((p) => p.username ?? "a reader").join(", ")

// Why this book is above the cold matches. From the database, never the model.
const SignalLine: FC<{ signal: FriendSignal }> = ({ signal }) => {
  const avatars = signal.people.length > 0 && (
    <span className="flex -space-x-1.5 shrink-0">
      {signal.people.map((p, i) => <CuratorAvatar key={i} person={p} size={16} className="ring-2 ring-background" />)}
    </span>
  )
  if (signal.kind === "followed") {
    return (
      <p className="flex items-center gap-1.5 min-w-0 text-[11px] font-medium">
        {avatars}
        <Star size={12} aria-hidden className="shrink-0 fill-current" />
        <span className="truncate">Rated {formatRating(signal.rating)} by {names(signal.people)}</span>
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1.5 min-w-0 text-[11px] font-medium">
      {avatars || <Users size={12} aria-hidden className="shrink-0" />}
      <span className="truncate">
        {signal.together && signal.count === 0
          ? "Read in one of your circles"
          : `Finished by ${names(signal.people)}${signal.count > signal.people.length ? ` and ${signal.count - signal.people.length} more` : ""} in your circles`}
      </span>
    </p>
  )
}

const Warnings: FC<{ result: AskResult }> = ({ result }) => {
  if (result.warnings.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        {result.tagReaders > 0 ? "No content warnings reported" : "No reader tags yet"}
      </p>
    )
  }
  return (
    <details className="group text-[11px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <AlertTriangle size={12} aria-hidden />
        <span className="group-open:hidden">Content warnings ({result.warnings.length})</span>
        <span className="hidden group-open:inline">Hide content warnings</span>
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {result.warnings.map((w) => (
          <li key={w.topic}>{w.topic} <span className="text-muted-foreground">({WARNING_LEVEL_LABEL[w.level]})</span></li>
        ))}
      </ul>
    </details>
  )
}

const ResultContext: FC<{ result: AskResult }> = ({ result }) => (
  <div className="flex flex-col gap-2">
    {result.shelf && (
      <p className="flex items-center gap-1.5 text-[11px] font-medium">
        <BookCheck size={12} aria-hidden className="shrink-0" />
        {result.shelf.status === "COMPLETED" && result.shelf.rating ? `You rated it ${formatRating(result.shelf.rating)}` : "On your shelf"}
      </p>
    )}
    {result.signal && <SignalLine signal={result.signal} />}
    {result.reason && (
      <p className="rounded-lg bg-neutral-50 dark:bg-neutral-900/60 px-2.5 py-2 text-xs leading-snug">
        <AiLabel className="mr-1 align-[1px]" />{result.reason}
      </p>
    )}
    {result.moods.length > 0 && (
      <ul className="flex flex-wrap gap-1" aria-label="Moods readers tagged">
        {result.moods.map((m) => (
          <li key={m.mood} className="rounded-full border border-neutral-300 dark:border-neutral-700 px-2 py-0.5 text-[11px]">{MOOD_LABEL[m.mood]}</li>
        ))}
      </ul>
    )}
    {result.spice?.level != null && (
      <p className="flex items-center gap-1.5 text-[11px]" aria-label={`Spice ${result.spice.level} of ${SPICE_MAX}, ${SPICE_LABEL[result.spice.level]}`}>
        <SpiceFlames level={result.spice.level} size={12} />
        <span aria-hidden>{SPICE_LABEL[result.spice.level]}</span>
      </p>
    )}
    <Warnings result={result} />
  </div>
)

// The search as the model read it, so the reader can see what was looked for and rephrase.
function intentChips(intent: ShelfIntent): string[] {
  const chips: string[] = [
    ...intent.moods.map((m) => MOOD_LABEL[m]),
    ...(intent.pace ? [`${intent.pace} pace`] : []),
    ...intent.genres,
    ...intent.mustHaves,
  ]
  if (intent.minPages && intent.maxPages) chips.push(`${intent.minPages}–${intent.maxPages} pages`)
  else if (intent.maxPages) chips.push(`under ${intent.maxPages} pages`)
  else if (intent.minPages) chips.push(`over ${intent.minPages} pages`)
  if (intent.format) chips.push(intent.format)
  const spice = spiceRangeText(intent.minSpice ?? null, intent.maxSpice ?? null)
  if (spice) chips.push(spice)
  for (const w of intent.mustNotHaves) chips.push(`no ${w.toLowerCase()}`)
  for (const s of intent.avoidSubjects) chips.push(`no ${s}`)
  for (const m of intent.avoidMoods) chips.push(`not ${MOOD_LABEL[m]}`)
  if (intent.rereads) chips.push("re-reads welcome")
  return chips
}

const allowanceText = (status: AllowanceStatus) =>
  status.left === null
    ? `${status.used} searches this month`
    : status.isPlus
      ? `${status.left} of ${status.allowance} searches left this month (fair use)`
      : `${status.left} of ${status.allowance} free searches left this month`

interface AskShelfProps {
  available: boolean
  // The reader has AI features on (preferencesOf(user).aiFeatures).
  enabled: boolean
  initialStatus: AllowanceStatus
}

type Outcome = AskShelfResponse & { query: string }

// The reader's recent searches with their results, newest first, kept for the browser session so
// coming back from a book doesn't lose them. Shown again as they were, never re-run: a re-run would
// spend another search. Keyed to the reader, so a different account on the same browser starts empty.
const RECENT_KEY = "bookmark:ask-shelf:recent"
const RECENT_MAX = 5

const sameQuery = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function readRecent(userId: string): Outcome[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? "null")
    return stored?.userId === userId && Array.isArray(stored.searches) ? stored.searches : []
  } catch {
    return []
  }
}

function addRecent(userId: string, outcome: Outcome): Outcome[] {
  const searches = [outcome, ...readRecent(userId).filter((s) => !sameQuery(s.query, outcome.query))].slice(0, RECENT_MAX)
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify({ userId, searches }))
  } catch {
    // Storage full or blocked: the search still shows, it just won't be there next time.
  }
  return searches
}

// AI is opt-in on free accounts. The feature stays in view, with the switch right here.
const TurnOnAi: FC<{ onEnabled: () => void }> = ({ onEnabled }) => {
  const { user, mutate } = useUser()
  const [saving, setSaving] = useState(false)
  const turnOn = () => {
    setSaving(true)
    axios.patch("/api/user/privacy", { aiFeatures: true })
      .then((res) => {
        if (user) mutate({ ...user, ...res.data }, { revalidate: false })
        onEnabled()
      })
      .catch((err) => notify.error(apiError(err, "Couldn't turn AI features on. Try again.")))
      .finally(() => setSaving(false))
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 max-w-2xl">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 dark:bg-neutral-900"><Feather size={18} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">AI features are off.</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Turn them on to use Ask the shelf, and Catch me up recaps with Plus. AI only runs when you ask it to, is always labelled, and is never about you. You can turn it off again in settings.</p>
      </div>
      <button type="button" onClick={turnOn} disabled={saving} className={primaryButtonClass}>
        {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Feather size={16} aria-hidden />}
        Turn on AI features
      </button>
    </div>
  )
}

const AskShelf: FC<AskShelfProps> = ({ available, enabled: initiallyEnabled, initialStatus }) => {
  const { user } = useUser()
  const { onOpen } = useListEditorModal()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(initialStatus)
  const [isSearching, setIsSearching] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState(!initialStatus.isPlus && initialStatus.left === 0)
  const [enabled, setEnabled] = useState(initiallyEnabled)
  const [recent, setRecent] = useState<Outcome[]>([])
  // Set when the question is about books already read: where shelf search would look (lib/shelfFilter.ts).
  const [ownShelf, setOwnShelf] = useState<Partial<ShelfFilter> | null>(null)

  // After mount, so the server render and the first client render agree.
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    const searches = readRecent(userId)
    setRecent(searches)
    if (searches[0]) {
      setOutcome(searches[0])
      setQuery(searches[0].query)
    }
  }, [userId])

  const showRecent = (search: Outcome) => {
    setOutcome(search)
    setQuery(search.query)
    setError(null)
  }

  if (!available) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 dark:bg-neutral-900"><Feather size={18} aria-hidden /></span>
        <div>
          <p className="font-medium">Search isn&apos;t available right now.</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Ask the shelf is switched off at the moment. Your searches this month aren&apos;t affected. Browse genres and lists on Discover in the meantime.</p>
        </div>
      </div>
    )
  }

  if (!enabled) return <TurnOnAi onEnabled={() => setEnabled(true)} />

  const outOfSearches = status.left === 0

  const search = (text: string, { anyway = false } = {}) => {
    const trimmed = text.trim()
    if (trimmed.length < 3 || isSearching) return
    // "Have I read…?" is about the reader's own shelf, which Ask the shelf leaves out: offer shelf search
    // instead, before spending one of their searches.
    const own = anyway ? null : shelfQuestion(trimmed, GENRES.map((g) => g.label))
    setOwnShelf(own)
    if (own) {
      setQuery(trimmed)
      return
    }
    setQuery(trimmed)
    setIsSearching(true)
    setError(null)
    axios.post<AskShelfResponse & { left: number | null, refunded?: boolean }>("/api/discover/ask", { query: trimmed })
      .then(({ data }) => {
        const next = { ...data, query: trimmed }
        setOutcome(next)
        // Nothing found is given back, and isn't worth keeping as a recent search.
        if (user && !data.refunded) setRecent(addRecent(user.id, next))
        setStatus((s) => ({ ...s, used: data.refunded ? s.used : s.used + 1, left: data.left, dailyLeft: Math.max(0, s.dailyLeft - 1) }))
        if (!status.isPlus && data.left === 0) setUpgrade(true)
      })
      .catch((err) => {
        const body = err?.response?.data
        if (isUpgradeRequired(body)) {
          setUpgrade(true)
          setStatus((s) => ({ ...s, left: 0 }))
          return
        }
        setError(apiError(err, "Search isn't available right now. Try again in a minute."))
      })
      .finally(() => setIsSearching(false))
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    search(query)
  }

  const saveAsList = () => {
    if (!outcome) return
    const base = emptyList(can(user, "lists.curate"), user ? preferencesOf(user).defaultListVisibility : undefined)
    onOpen({
      ...base,
      title: outcome.query.slice(0, 80),
      // The reader's own list: no AI text goes into its notes.
      items: outcome.results.map((r) => ({ workKey: r.workKey, title: r.title, author: r.author, coverUrl: r.coverUrl, pages: r.pages, note: "" })),
    })
  }

  const chips = outcome ? intentChips(outcome.intent) : []
  const anySignal = outcome?.results.some((r) => r.signal)

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-2xl">
        <label htmlFor="ask-shelf-query" className="text-sm font-medium">What are you in the mood for?</label>
        <textarea
          id="ask-shelf-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              search(query)
            }
          }}
          maxLength={ASK_QUERY_MAX}
          rows={3}
          disabled={outOfSearches}
          placeholder="A mood, a trope, a length, anything you don't want…"
          className="w-full resize-none rounded-2xl border border-neutral-300 dark:border-input bg-background px-4 py-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">{allowanceText(status)}</p>
          <button type="submit" disabled={isSearching || outOfSearches || query.trim().length < 3} className={primaryButtonClass}>
            {isSearching ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Feather size={16} aria-hidden />}
            {isSearching ? "Searching…" : "Ask"}
          </button>
        </div>
        {!outcome && !outOfSearches && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Try one of these:</p>
            <ul className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => search(example)}
                    disabled={isSearching}
                    className="rounded-full border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {recent.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Recent searches <span className="opacity-80">· opening one again is free</span></p>
            <ul className="flex flex-wrap gap-2">
              {recent.map((search) => {
                const current = outcome?.query === search.query
                return (
                  <li key={search.query}>
                    <button
                      type="button"
                      onClick={() => showRecent(search)}
                      disabled={isSearching}
                      aria-pressed={current}
                      className={cn(
                        "max-w-[18rem] truncate rounded-full border px-3 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                        current ? "border-foreground bg-neutral-100 dark:bg-neutral-900" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900",
                      )}
                    >
                      {search.query}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </form>

      {ownShelf && (
        <div role="status" className="max-w-2xl rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <p className="font-semibold">Looking for a book you&apos;ve already read?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask the shelf suggests books you haven&apos;t read yet. Your own shelf can be searched by title or author and
            filtered by year, genre and rating{ownShelf.year || ownShelf.genre ? `, and we've set it to ${[ownShelf.genre, ownShelf.year && `finished in ${ownShelf.year}`].filter(Boolean).join(", ")}` : ""}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/shelf?${shelfParams(ownShelf)}`} className={primaryButtonClass}>
              <Search size={16} aria-hidden />Search your shelf
            </Link>
            <button type="button" onClick={() => search(query, { anyway: true })} className={secondaryButtonClass}>
              Ask for new books anyway
            </button>
          </div>
        </div>
      )}

      {upgrade && <UpgradePrompt feature="askShelfSearches" className="max-w-2xl" />}
      {error && <p role="alert" className="max-w-2xl rounded-2xl border border-rose-500/30 p-4 text-sm">{error}</p>}

      {outcome && (
        <section aria-labelledby="ask-results-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="ask-results-heading" className="text-lg font-semibold">
                {outcome.results.length > 0 ? `${outcome.results.length} ${outcome.results.length === 1 ? "book" : "books"} from the catalog` : "Nothing in the catalog fits yet"}
              </h2>
              {chips.length > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <AiLabel />
                  <span>Searched for</span>
                  {chips.map((chip) => <span key={chip} className="rounded-full bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 text-foreground">{chip}</span>)}
                </p>
              )}
              {anySignal && <p className="mt-1 text-xs text-muted-foreground">Books loved by people you follow and read in your circles come first.</p>}
            </div>
            {outcome.results.length > 0 && (
              <button type="button" onClick={saveAsList} className={secondaryButtonClass}>
                <ListPlus size={16} aria-hidden />Save as list
              </button>
            )}
          </div>

          {outcome.results.length === 0 ? (
            <p className="max-w-2xl rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-sm text-muted-foreground">
              {chips.length === 0
                ? "That didn't read as a book request. Describe a mood, a genre or a trope and try again."
                : "No book in Bookmark's catalog matches all of that yet. Try fewer conditions, or a different way of putting it."}
              {" "}That one didn&apos;t count towards your searches.
            </p>
          ) : (
            <div className="flex flex-col gap-8">
              {[outcome.results.filter((r) => r.strong), outcome.results.filter((r) => !r.strong)].map((group, g) => group.length > 0 && (
                <div key={g} className="flex flex-col gap-4">
                  {g === 1 && (
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      {group.length === outcome.results.length ? "Nothing fits all of that, so these are the closest" : "Closer to some of it than all of it"}
                    </h3>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-10">
                    {group.map((result) => (
                      <DiscoverBookCard
                        key={result.workId}
                        book={{ workKey: result.workKey, title: result.title, author: result.author, pages: result.pages, coverUrl: result.coverUrl, year: result.year }}
                        context={<ResultContext result={result} />}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {outcome.reasons === "failed" && <p className="text-xs text-muted-foreground">The short summaries couldn&apos;t be written this time. The books are the same.</p>}
          <p className="text-xs text-muted-foreground">
            Every book here is in Bookmark&apos;s catalog; {outcome.intent.rereads ? "books you’ve read are included" : "books on your shelf are left out"}. Lines marked <AiLabel className="mx-0.5" /> are written by AI from each book&apos;s description and readers&apos; tags.
          </p>
        </section>
      )}
    </div>
  )
}

export default AskShelf
