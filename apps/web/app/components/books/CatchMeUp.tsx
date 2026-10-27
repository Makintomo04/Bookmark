"use client"
import { FC, useEffect, useState } from 'react'
import axios from 'axios'
import Link from 'next/link'
import useSWR from 'swr'
import { BookOpen, Loader2, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { FEATURE_COPY, UPGRADE_URL, isUpgradeRequired } from '@/lib/entitlements'
import type { AllowanceStatus } from '@/lib/ai/usage'
import type { RecapKind, RecapVote, ResumeOption, SeriesOption, StoredRecap } from '@/lib/recap'
import { formatPercent } from '@/lib/buddyReads'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { AiLabel } from '../discover/AskShelf'
import UpgradePrompt from '../plus/UpgradePrompt'

// "Catch me up" on the book page (BookUpdateModal): a short AI recap of the story so far, or of the
// earlier books in a series. A gentle prompt card when the reader is coming back to the book (paused,
// untouched for a while, or starting a later book in a series), otherwise one quiet action. Shows
// nothing when the reader switched recaps off, or when the book isn't well known enough to recap.
// Catch me up comes with Plus (free allowance 0): a free reader gets one quiet line pointing at /plus
// instead of a button that would only fail, and can still open recaps they kept from a Plus month.
// Types only from lib/recap.ts: it meters usage on the server and mustn't reach the client bundle.

// On every recap, whatever its kind.
const RECAP_LABEL = "Written by AI from what's known about this book. May be imperfect. Only you see this."

type Option<T> = (T & { recap: StoredRecap | null }) | null

type RecapStateResponse =
  | { enabled: false }
  | { enabled: true, available: boolean, resume: Option<ResumeOption>, series: Option<SeriesOption>, allowance: AllowanceStatus }

type View =
  | { kind: 'idle' }
  | { kind: 'loading', recapKind: RecapKind }
  | { kind: 'recap', recapKind: RecapKind, recap: StoredRecap }
  | { kind: 'notConfident' }
  | { kind: 'upgrade' }
  | { kind: 'error', message: string }

const listJoin = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const seriesBooksText = (s: SeriesOption) => {
  const positions = s.books.map((b) => b.position)
  const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1)
  if (positions.length > 2 && contiguous) return `books ${positions[0]} to ${positions[positions.length - 1]}`
  return `${positions.length === 1 ? 'book' : 'books'} ${listJoin(positions.map(String))}`
}

const promptText = (resume: ResumeOption | null, series: SeriesOption | null) => {
  if (resume?.prompt) {
    const lead = resume.reason === 'paused' ? 'Picking this back up?' : 'Been a little while?'
    return `${lead} Get a short recap of the story up to ${formatPercent(resume.bound)}, with nothing from further on.`
  }
  if (series?.prompt) return `Starting book ${series.position} of ${series.seriesName}? Get a recap of ${seriesBooksText(series)}, which you've finished, and nothing from this one.`
  return ''
}

// A free allowance of 0 means the feature comes with Plus.
const withPlusOnly = (a: AllowanceStatus) => !a.isPlus && a.allowance === 0

const allowanceText = (a: AllowanceStatus) =>
  a.left === null || withPlusOnly(a) ? null
    : a.isPlus ? `${a.left} of ${a.allowance} recaps left this month (fair use)`
    : `${a.left} of ${a.allowance} free recaps left this month`

const CatchMeUp: FC<{ bookId: string, accent: string, accentInk: string }> = ({ bookId, accent, accentInk }) => {
  const key = `/api/books/${bookId}/recap`
  const { data, mutate } = useSWR<RecapStateResponse>(key, fetcher, swrOptions)
  const [view, setView] = useState<View>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [vote, setVote] = useState<RecapVote | null>(null)

  useEffect(() => {
    setView({ kind: 'idle' })
    setDismissed(false)
  }, [bookId])

  if (!data || !data.enabled) return null
  const { resume, series, available, allowance } = data
  if (!resume && !series) return null

  const show = (recapKind: RecapKind, recap: StoredRecap) => {
    setVote(recap.vote)
    setView({ kind: 'recap', recapKind, recap })
  }

  const ask = (recapKind: RecapKind) => {
    const kept = recapKind === 'RESUME' ? resume?.recap : series?.recap
    if (kept) {
      if (kept.confident) show(recapKind, kept)
      else setView({ kind: 'notConfident' })
      return
    }
    setView({ kind: 'loading', recapKind })
    axios.post(key, { kind: recapKind })
      .then((res) => {
        if (res.data.status === 'ready') show(recapKind, res.data.recap)
        else setView({ kind: 'notConfident' })
        mutate()
      })
      .catch((err) => {
        const body = err?.response?.data
        if (isUpgradeRequired(body)) setView({ kind: 'upgrade' })
        else setView({ kind: 'error', message: body?.error ?? "Couldn't write a recap right now. Try again in a minute." })
      })
  }

  const sendVote = (next: RecapVote) => {
    if (view.kind !== 'recap') return
    const value = vote === next ? null : next
    const before = vote
    setVote(value)
    axios.patch(key, { recapId: view.recap.id, vote: value })
      .then(() => mutate())
      .catch(() => setVote(before))
  }

  const plusOnly = withPlusOnly(allowance)
  let actions: { kind: RecapKind, label: string }[] = []
  if (resume) actions.push({ kind: 'RESUME', label: resume.recap?.confident ? 'Show my recap' : 'Catch me up' })
  if (series) actions.push({ kind: 'SERIES', label: series.recap?.confident ? `Show recap of ${seriesBooksText(series)}` : `Recap ${seriesBooksText(series)}` })
  // The prompt leads with the kind that triggered it.
  if (!resume?.prompt && series?.prompt) actions.reverse()
  // Without Plus, only kept recaps open.
  const kept = (kind: RecapKind) => (kind === 'RESUME' ? resume?.recap : series?.recap)
  const lockedOut = plusOnly && actions.some((a) => !kept(a.kind))
  if (plusOnly) actions = actions.filter((a) => kept(a.kind))
  const withPlus = lockedOut && view.kind === 'idle' && (
    <p className="text-xs text-muted-foreground">
      <Link href={UPGRADE_URL} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
        <Sparkles size={12} aria-hidden />{FEATURE_COPY.recaps.title}
      </Link>
    </p>
  )

  // The prompt card only offers what the reader can open.
  const openResume = plusOnly && !resume?.recap ? null : resume
  const openSeries = plusOnly && !series?.recap ? null : series
  const prompting = !dismissed && (openResume?.prompt || openSeries?.prompt)
  const intro = promptText(openResume, openSeries)
  const busy = view.kind === 'loading'

  const body = (() => {
    switch (view.kind) {
      case 'loading':
        return (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Writing a recap{view.recapKind === 'RESUME' && resume ? ` up to ${formatPercent(resume.bound)}` : ''}…
          </p>
        )
      case 'recap':
        return (
          <article className="flex flex-col gap-3" aria-label="Recap">
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <AiLabel />
              <span>{RECAP_LABEL}</span>
            </p>
            {view.recapKind === 'RESUME' && (
              <p className="text-xs font-medium">The story up to {formatPercent(view.recap.bucket)}</p>
            )}
            {view.recapKind === 'SERIES' && series && (
              <p className="text-xs font-medium">{series.seriesName}: {listJoin(series.books.map((b) => b.title))}</p>
            )}
            <div className="flex flex-col gap-2.5 text-sm leading-relaxed">
              {view.recap.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Was this accurate?</span>
              <button
                type="button"
                onClick={() => sendVote('UP')}
                aria-pressed={vote === 'UP'}
                aria-label="Accurate"
                className={cn('grid size-8 place-items-center rounded-md border transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', vote === 'UP' && 'bg-foreground text-background hover:bg-foreground')}
              >
                <ThumbsUp size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => sendVote('DOWN')}
                aria-pressed={vote === 'DOWN'}
                aria-label="Not accurate"
                className={cn('grid size-8 place-items-center rounded-md border transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', vote === 'DOWN' && 'bg-foreground text-background hover:bg-foreground')}
              >
                <ThumbsDown size={14} aria-hidden />
              </button>
              <button type="button" onClick={() => setView({ kind: 'idle' })} className="ml-auto rounded px-1 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Hide
              </button>
            </div>
          </article>
        )
      case 'notConfident':
        return (
          <p className="text-sm text-muted-foreground">
            We can&apos;t recap this one reliably, so we won&apos;t guess. That didn&apos;t count towards your recaps.
          </p>
        )
      case 'upgrade':
        return <UpgradePrompt feature="recaps" />
      case 'error':
        return <p className="text-sm text-muted-foreground" role="alert">{view.message}</p>
      default:
        return null
    }
  })()

  const buttons = available && view.kind !== 'recap' && view.kind !== 'upgrade' && (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a, i) => (
        i === 0 && prompting
          ? (
            <Button key={a.kind} size="sm" style={{ background: accent, color: accentInk }} onClick={() => ask(a.kind)} disabled={busy}>
              <Sparkles size={14} className="mr-1.5" aria-hidden />{a.label}
            </Button>
          )
          : (
            <Button key={a.kind} size="sm" variant="outline" onClick={() => ask(a.kind)} disabled={busy}>
              {i === 0 && <BookOpen size={14} className="mr-1.5" aria-hidden />}{a.label}
            </Button>
          )
      ))}
    </div>
  )

  const unavailable = !available && <p className="text-xs text-muted-foreground">Recaps aren&apos;t available right now.</p>
  const left = allowanceText(allowance)

  if (prompting && view.kind === 'idle') {
    return (
      <section aria-label="Catch me up" className="relative flex flex-col gap-3 rounded-2xl border p-4">
        <button type="button" onClick={() => setDismissed(true)} aria-label="Not now" className="absolute right-2 top-2 grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X size={16} aria-hidden />
        </button>
        <div className="flex items-start gap-3 pr-8">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
            <Sparkles size={16} aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">Catch me up</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{intro}</p>
          </div>
        </div>
        {buttons}
        {withPlus}
        {unavailable}
        {available && left && <p className="text-[11px] text-muted-foreground">{left}. Opening a recap again is free.</p>}
      </section>
    )
  }

  return (
    <section aria-label="Catch me up" className={cn('flex flex-col gap-3', view.kind !== 'idle' && view.kind !== 'upgrade' && 'rounded-2xl border p-4')}>
      {view.kind === 'idle' ? buttons : body}
      {view.kind !== 'idle' && view.kind !== 'recap' && view.kind !== 'loading' && buttons}
      {withPlus}
      {view.kind === 'idle' && unavailable}
    </section>
  )
}

export default CatchMeUp
