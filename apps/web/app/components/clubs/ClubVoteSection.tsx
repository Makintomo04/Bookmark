"use client"
import { FC, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { Check, Plus, Vote, X } from 'lucide-react'
import type { Book } from '@prisma/client'
import { notify, apiError } from '@/lib/notify'
import { readerName } from '@/lib/profile'
import { sameBook } from '@/lib/workKey'
import { VOTE_DAYS_DEFAULT, VOTE_DAYS_MAX, VOTE_NOMINATIONS_MAX, closesInText, settledVoteText, turnoutText } from '@/lib/clubVotes'
import type { ClubVoteView } from '@/lib/clubVotesServer'
import useClubVote from '@/app/hooks/useClubVote'
import useBooks from '@/app/hooks/useBooks'
import BookCover from '../cards/BookCover'
import Modal from '../modals/Modal'

import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import { ClearableInput } from '@/app/components/ui/clearable-input'

type Nomination = ClubVoteView["nominations"][number]

const linkClass = "text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
const inputClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
// Anything on the shelf can be put up, apart from books the reader said they won't read.
const NOMINABLE = new Set(["STARTED", "PAUSED", "NOT_STARTED", "FINISHED", "DNF"])

// "Voted for by ana, ben and 3 others": only people the viewer may see named (lib/clubVotesServer.ts).
function votersText(n: Nomination) {
  const names = (n.voters ?? []).map((v) => (v.isYou ? "you" : readerName(v))).filter(Boolean) as string[]
  const others = n.otherVoters ?? 0
  if (names.length === 0) return others > 0 ? `${others} ${others === 1 ? "vote" : "votes"}` : "No votes"
  const shown = names.slice(0, 3)
  const more = names.length - shown.length + others
  return `${shown.join(", ")}${more > 0 ? ` and ${more} ${more === 1 ? "other" : "others"}` : ""}`
}

// The club picks its next book (BOO-49 phase 2): open a vote, put books up, vote, and once it's closed,
// the result and a host's "Start this book".
const ClubVoteSection: FC<{ clubId: string, canManage: boolean, archived: boolean }> = ({ clubId, canManage, archived }) => {
  const router = useRouter()
  const { view, mutate } = useClubVote(clubId)
  const [opening, setOpening] = useState(false)
  const [days, setDays] = useState(VOTE_DAYS_DEFAULT)
  const [hostsOnly, setHostsOnly] = useState(false)
  const [nominating, setNominating] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!view || archived) return null
  const { vote, viewer, nominations } = view

  const act = (p: Promise<unknown>, fallback: string, then?: () => void) => {
    setBusy(true)
    p.then(() => { then?.(); mutate() })
      .catch((err) => notify.error(apiError(err, fallback)))
      .finally(() => setBusy(false))
  }

  if (!vote) {
    if (!canManage) return null
    return (
      <section id="club-vote" aria-labelledby="vote-heading" className="flex flex-col gap-3">
        <h2 id="vote-heading" className="text-lg font-semibold">Vote on the next book</h2>
        {opening ? (
          <form onSubmit={(e) => { e.preventDefault(); act(axios.post(`/api/clubs/${clubId}/votes`, { days, hostsOnly }), "Couldn't open the vote.", () => setOpening(false)) }} className="flex max-w-md flex-col gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
            <label htmlFor="vote-days" className="text-sm font-medium">How long it runs</label>
            <select id="vote-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputClass}>
              {Array.from({ length: VOTE_DAYS_MAX }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>)}
            </select>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Who puts books up</legend>
              <label className="flex items-start gap-2 text-sm"><input type="radio" name="nominators" checked={!hostsOnly} onChange={() => setHostsOnly(false)} className="mt-1" />Everyone, one book each</label>
              <label className="flex items-start gap-2 text-sm"><input type="radio" name="nominators" checked={hostsOnly} onChange={() => setHostsOnly(true)} className="mt-1" />Only you and your co-hosts, as a shortlist</label>
            </fieldset>
            <p className="text-xs text-muted-foreground">{hostsOnly ? "Everyone else is told once the first book is up." : "Everyone in the club is told."} Votes stay hidden until it closes, then the book with the most wins. If it&apos;s a tie, you pick.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={primaryButtonClass}>Open the vote</button>
              <button type="button" onClick={() => setOpening(false)} className={secondaryButtonClass}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6">
            <p className="text-sm text-muted-foreground">Let the club choose what it reads next. Members put books up from their shelves and everyone votes.</p>
            <button type="button" onClick={() => setOpening(true)} className={secondaryButtonClass}><Vote size={16} aria-hidden />Open a vote</button>
          </div>
        )}
      </section>
    )
  }

  const open = vote.status === "OPEN"
  const tied = vote.status === "TIED"
  const settled = settledVoteText(vote, viewer.canRun)
  const winner = vote.status === "CLOSED" ? nominations.find((n) => n.id === vote.winnerId) : undefined
  const ranked = open ? nominations : [...nominations].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))

  const startWinner = () => act(
    axios.post(`/api/clubs/${clubId}/votes/${vote.id}/winner-copy`).then(({ data }) => router.push(`/circles/new?clubId=${clubId}&bookId=${data.bookId}`)),
    "Couldn't get the book ready.",
  )

  return (
    <section id="club-vote" aria-labelledby="vote-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="vote-heading" className="text-lg font-semibold">
            {open ? "Vote on the next book" : settled.heading}
          </h2>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {open ? `${closesInText(vote.closesAt)} · ${turnoutText(vote.voted, vote.memberCount)}` : settled.line}
          </p>
        </div>
        {open && viewer.canRun && (
          <div className="flex gap-3">
            <button type="button" disabled={busy || nominations.length === 0} onClick={() => window.confirm("Close the vote now? The book with the most votes wins.") && act(axios.patch(`/api/clubs/${clubId}/votes/${vote.id}`, { action: "close" }), "Couldn't close the vote.")} className={linkClass}>Close now</button>
            <button type="button" disabled={busy} onClick={() => window.confirm("Cancel this vote? The books put up and the votes cast so far are dropped.") && act(axios.patch(`/api/clubs/${clubId}/votes/${vote.id}`, { action: "cancel" }), "Couldn't cancel the vote.")} className={linkClass}>Cancel vote</button>
          </div>
        )}
      </div>

      {winner && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
          <BookCover book={{ title: winner.title, author: winner.author, coverImage: winner.coverImage ?? "", cardColour: winner.cardColour }} variant="thumb" sizes="64px" className="w-16 shrink-0 shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{winner.title}</p>
            <p className="text-sm text-muted-foreground">{winner.author}</p>
            <p className="text-xs text-muted-foreground">{winner.votes} {winner.votes === 1 ? "vote" : "votes"} · {votersText(winner)}</p>
          </div>
          {viewer.canRun ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy} onClick={startWinner} className={primaryButtonClass}>Start this book</button>
              <button type="button" disabled={busy} onClick={() => window.confirm(`Put this away without starting ${winner.title}? The club page stops showing it.`) && act(axios.patch(`/api/clubs/${clubId}/votes/${vote.id}`, { action: "dismiss" }), "Couldn't put it away.")} className={linkClass}>Not now</button>
            </div>
          ) : <p className="text-sm text-muted-foreground">The host will start it soon.</p>}
        </div>
      )}

      {(open || tied || (winner && nominations.length > 1)) && (
        <ul className="flex flex-col gap-2" aria-label={open ? "Books up for the vote" : "Results"}>
          {ranked.filter((n) => n.id !== winner?.id).map((n) => {
            const mine = viewer.myBallot === n.id
            const inTie = tied && vote.tiedIds.includes(n.id)
            return (
              <li key={n.id} className={`flex items-center gap-3 rounded-xl border p-3 ${mine ? "border-foreground" : "border-neutral-200 dark:border-neutral-800"}`}>
                <BookCover book={{ title: n.title, author: n.author, coverImage: n.coverImage ?? "", cardColour: n.cardColour }} variant="thumb" sizes="40px" className="w-10 shrink-0 shadow-sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug line-clamp-2">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {n.author}
                    {n.nominatedBy ? <> · put up by {n.isMine ? "you" : readerName(n.nominatedBy)}</> : null}
                  </p>
                  {n.votes !== null && <p className="text-xs text-muted-foreground">{n.votes} {n.votes === 1 ? "vote" : "votes"}{n.votes > 0 ? ` · ${votersText(n)}` : ""}</p>}
                </div>
                {open && viewer.canVote && (
                  <button type="button" disabled={busy || mine} aria-pressed={mine} onClick={() => act(axios.put(`/api/clubs/${clubId}/votes/${vote.id}/ballot`, { nominationId: n.id }), "Couldn't record your vote.")} className={mine ? primaryButtonClass : secondaryButtonClass}>
                    {mine ? <><Check size={16} aria-hidden />Your vote</> : "Vote"}
                  </button>
                )}
                {inTie && viewer.canRun && (
                  <button type="button" disabled={busy} onClick={() => window.confirm(`Make ${n.title} the club's next book?`) && act(axios.patch(`/api/clubs/${clubId}/votes/${vote.id}`, { action: "pick", nominationId: n.id }), "Couldn't pick the winner.")} className={primaryButtonClass}>Pick this one</button>
                )}
                {n.removable && (
                  <button type="button" disabled={busy} aria-label={`Take down ${n.title}`} onClick={() => window.confirm(n.isMine ? "Take your book down? Votes for it are dropped." : `Take down ${n.title}? Votes for it are dropped, and those members can vote again.`) && act(axios.delete(`/api/clubs/${clubId}/votes/${vote.id}/nominations/${n.id}`), "Couldn't take it down.")} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <X size={16} aria-hidden />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {open && nominations.length === 0 && <p className="text-sm text-muted-foreground">No books yet. {viewer.canNominate ? "Put one up from your shelf." : vote.hostsOnly ? "The host is choosing the shortlist." : ""}</p>}
      {open && viewer.canNominate && nominations.length < VOTE_NOMINATIONS_MAX && (
        <button type="button" onClick={() => setNominating(true)} className={`${secondaryButtonClass} self-start`}><Plus size={16} aria-hidden />Put a book up</button>
      )}
      {open && viewer.muted && <p className="text-xs text-muted-foreground">A host has muted you in this club, so you can vote but not put a book up.</p>}
      {open && <p className="text-xs text-muted-foreground">Votes stay hidden until the vote closes. You can change yours until then.</p>}

      <NominateDialog
        isOpen={nominating}
        onClose={() => setNominating(false)}
        taken={nominations}
        reading={view.reading}
        onPick={(bookId) => act(axios.post(`/api/clubs/${clubId}/votes/${vote.id}/nominations`, { bookId }), "Couldn't put that book up.", () => setNominating(false))}
        busy={busy}
      />
    </section>
  )
}

// A book from the reader's shelf, searched by title or author.
const NominateDialog: FC<{ isOpen: boolean, onClose: () => void, taken: Nomination[], reading: ClubVoteView["reading"], onPick: (bookId: string) => void, busy: boolean }> = ({ isOpen, onClose, taken, reading, onPick, busy }) => {
  const { books } = useBooks({ onlyWhen: isOpen })
  const [query, setQuery] = useState("")
  const shelf = useMemo(() => ((books ?? []) as Book[]).filter((b) => NOMINABLE.has(b.status)), [books])
  const q = query.trim().toLowerCase()
  const matches = (q ? shelf.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)) : shelf).slice(0, 50)
  // Matched as the server matches (the work, else title and author): already up, or the club's book now.
  const why = (b: Book) => reading.some((c) => sameBook(c, b)) ? "reading now" : taken.some((n) => sameBook(n, b)) ? "already up" : null
  const isTaken = (b: Book) => why(b) !== null

  const body = (
    <div className="flex w-full flex-col gap-3 px-6 pt-4">
      <label htmlFor="nominate-search" className="sr-only">Search your shelf</label>
      <ClearableInput id="nominate-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your shelf" className={inputClass} />
      {books && shelf.length === 0 && <p className="text-sm text-muted-foreground">Nothing on your shelf yet. Add the book you want to put up, then come back.</p>}
      <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
        {matches.map((b) => (
          <li key={b.id}>
            <button type="button" disabled={busy || isTaken(b)} onClick={() => onPick(b.id)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-60">
              <BookCover book={{ title: b.title, author: b.author, coverImage: b.coverImage ?? "", cardColour: b.cardColour }} variant="thumb" sizes="36px" className="w-9 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{b.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{b.author}{why(b) ? ` · ${why(b)}` : ""}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Put a book up" size="sm" compact disabled={busy} body={body}
      footer={<div className="flex justify-end p-6 pt-4"><button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button></div>} />
  )
}

export default ClubVoteSection
