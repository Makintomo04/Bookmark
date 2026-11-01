// Club votes (BOO-49 phase 2): the club picks its next book. Shared by the API and the apps; no database or
// "@/" imports, so the rules can be checked under plain Node.
//
// A host or co-host opens a vote with a closing time. Members nominate one book each from their shelves (or
// only the host and co-hosts do, as a shortlist), and everyone in the club votes for one, changing it as
// often as they like until it closes. Counts stay hidden until then, so an early lead can't snowball. It
// closes on its own at closesAt (the cron tick, or whoever opens the club first), or early when a host says.
// A tie goes to the host and co-hosts to pick from. The winner doesn't start itself: a host starts it as the
// club's next book, with its dates, from the club page.
import { z } from "zod";
import type { ClubRole } from "./clubs";
import { canManageClub } from "./clubs";

export const VOTE_NOMINATIONS_MAX = 10
export const VOTE_DAYS_DEFAULT = 3
export const VOTE_DAYS_MIN = 1
export const VOTE_DAYS_MAX = 14

export type ClubVoteStatus = "OPEN" | "TIED" | "CLOSED" | "CANCELLED"

// ---- Who may do what ------------------------------------------------------------------------

// Opening, closing early, cancelling, removing a nomination and breaking a tie.
export const canRunVote = (role: ClubRole | null | undefined) => canManageClub(role)

// Whether this member may put a book up. A host-muted member (lib/clubs.ts canMuteInClub) can still vote.
export function canNominate(role: ClubRole | null | undefined, opts: { hostsOnly: boolean, muted: boolean }) {
  if (!role || opts.muted) return false
  return opts.hostsOnly ? canManageClub(role) : true
}

// How many books one person may put up: one each when everyone nominates; on a hosts-only shortlist a host
// (even the only one) may fill it, up to the vote's ten.
export const nominationsEach = (hostsOnly: boolean) => (hostsOnly ? VOTE_NOMINATIONS_MAX : 1)
export const mayNominateMore = (hostsOnly: boolean, mine: number) => mine < nominationsEach(hostsOnly)
export const ONE_BOOK_EACH_MESSAGE = "You've already put a book up. Take it down to choose another."
export const ALREADY_UP_MESSAGE = "That book's already up for the vote. Vote for it instead."
export const READING_IT_MESSAGE = "The club is reading that book already. Put up what it reads next."

export const NOMINATIONS_FULL_MESSAGE = `This vote already has ${VOTE_NOMINATIONS_MAX} books. Vote for one of them instead.`
export const VOTE_ALREADY_OPEN_MESSAGE = "The club already has a vote on. Close it before opening another."
export const VOTE_CLOSED_MESSAGE = "This vote has closed."

export const closesAtFor = (days: number, now: Date = new Date()) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
export const isVoteDue = (vote: { status: ClubVoteStatus, closesAt: Date | string }, now: Date = new Date()) =>
  vote.status === "OPEN" && new Date(vote.closesAt).getTime() <= now.getTime()

// Counts (and who voted for what) are shown once the vote has closed, to everyone, hosts included.
export const countsVisible = (status: ClubVoteStatus) => status !== "OPEN"

// ---- Counting -------------------------------------------------------------------------------

export type BallotLike = { userId: string, nominationId: string }

// Votes per nomination, from current members only: someone who left the club no longer counts. Every
// nomination is listed, with 0 if nobody voted for it.
export function tallyVotes(nominationIds: string[], ballots: BallotLike[], memberIds: Set<string>) {
  const counts = new Map(nominationIds.map((id) => [id, 0]))
  for (const b of ballots) {
    if (!memberIds.has(b.userId) || !counts.has(b.nominationId)) continue
    counts.set(b.nominationId, counts.get(b.nominationId)! + 1)
  }
  return counts
}

export type VoteOutcome =
  | { kind: "winner", nominationId: string }
  | { kind: "tied", nominationIds: string[], unvoted: boolean }
  | { kind: "empty" }

// The winner, or the books level at the top for a host to choose between (every book, if nobody voted:
// `unvoted`, which is said as that rather than as a tie). No books at all and the vote is cancelled.
export function voteOutcome(counts: Map<string, number>): VoteOutcome {
  if (counts.size === 0) return { kind: "empty" }
  const top = Math.max(...counts.values())
  const leaders = [...counts].filter(([, n]) => n === top).map(([id]) => id)
  return leaders.length === 1 ? { kind: "winner", nominationId: leaders[0] } : { kind: "tied", nominationIds: leaders, unvoted: top === 0 }
}

// Like the club's member cap: nominations are counted after they're written, so two at the same moment can't
// both squeeze past the tenth. The nominations in the order written, and whether this one is in the first max.
export function nominationAdmitted(order: string[], nominationId: string, max: number = VOTE_NOMINATIONS_MAX) {
  const at = order.indexOf(nominationId)
  return at >= 0 && at < max
}

// ---- Input ----------------------------------------------------------------------------------

export const openVoteSchema = z.object({
  days: z.number().int().min(VOTE_DAYS_MIN).max(VOTE_DAYS_MAX, `A vote can run for up to ${VOTE_DAYS_MAX} days`).default(VOTE_DAYS_DEFAULT),
  hostsOnly: z.boolean().default(false),
})

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "That book isn't there any more.")
export const nominateSchema = z.object({ bookId: objectId })
export const ballotSchema = z.object({ nominationId: objectId })
export const voteActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("pick"), nominationId: objectId }),
  // Put the winner card away without starting the book.
  z.object({ action: z.literal("dismiss") }),
])

// ---- Copy -----------------------------------------------------------------------------------

// "Closes in 2 days", "Closes in 5 hours", "Closes in under an hour", for the vote card. Days and hours are
// rounded, so a 7-day vote just opened says 7, not 6, and a 1-day vote 24 hours, not 23.
export function closesInText(closesAt: Date | string, now: Date = new Date()) {
  const ms = new Date(closesAt).getTime() - now.getTime()
  if (ms <= 0) return "Closing now"
  if (ms < 60 * 60 * 1000) return "Closes in under an hour"
  const hours = Math.round(ms / (60 * 60 * 1000))
  if (hours < 48) return `Closes in ${hours} ${hours === 1 ? "hour" : "hours"}`
  const days = Math.round(ms / (24 * 60 * 60 * 1000))
  return `Closes in ${days} days`
}

// "12 of 40 have voted": turnout is shown while the vote is open; which book is ahead isn't.
export const turnoutText = (voted: number, members: number) => `${voted} of ${members} ${voted === 1 ? "has" : "have"} voted`

// The vote card's heading and the line under it once it's closed. A vote nobody voted in goes to the hosts to
// pick like a tie, but isn't called one.
export function settledVoteText(v: { status: ClubVoteStatus, voted: number }, canRun: boolean) {
  if (v.status === "TIED" && v.voted === 0) {
    return { heading: "Nobody voted", line: canRun ? "Pick the winner from the books put up." : "The host is picking from the books put up." }
  }
  if (v.status === "TIED") {
    return { heading: "The vote’s a tie", line: canRun ? "Pick the winner from the books level at the top." : "The host is picking between the books level at the top." }
  }
  return { heading: "The club has picked", line: `${v.voted} ${v.voted === 1 ? "vote" : "votes"} counted.` }
}

// Kept in a CLUB_VOTE_TIED notification's message when nobody voted at all.
export const NO_VOTES_MESSAGE = "no-votes"
// Kept in a CLUB_VOTE_OPENED notification's message on a hosts-only vote, where members can't put books up.
// Older rows went to everyone; now members hear once the shortlist is up (SHORTLIST_UP_MESSAGE) instead.
export const HOSTS_ONLY_MESSAGE = "hosts-only"
// CLUB_VOTE_OPENED to the other hosts when a hosts-only vote opens: they're the ones putting books up.
export const SHORTLIST_OPEN_MESSAGE = "shortlist-open"
// CLUB_VOTE_OPENED to members, sent when a host puts up a hosts-only vote's first book.
export const SHORTLIST_UP_MESSAGE = "shortlist-up"
// Kept in a CLUB_VOTE_CANCELLED notification's message when archiving the club called the vote off.
export const ARCHIVED_MESSAGE = "archived"

// The bell, the push and the phone's notifications list say the same. Nobody is named: a vote is the club's.
// `message` is the winning book for CLUB_VOTE_PICKED, NO_VOTES_MESSAGE on a CLUB_VOTE_TIED nobody voted in, one
// of the shortlist messages on a hosts-only CLUB_VOTE_OPENED, and ARCHIVED_MESSAGE on a CLUB_VOTE_CANCELLED
// that archiving caused.
export function clubVoteText(type: string, club: string | null, message?: string | null) {
  const name = club ?? "Your club"
  switch (type) {
    case "CLUB_VOTE_OPENED": return message === SHORTLIST_OPEN_MESSAGE
      ? `${name} is voting on its next book. Put books up for the shortlist.`
      : message === SHORTLIST_UP_MESSAGE
        ? `The shortlist for ${name}'s next book is up. Cast your vote.`
        : message === HOSTS_ONLY_MESSAGE
          ? `${name} is voting on its next book. The hosts are putting up the shortlist; cast your vote.`
          : `${name} is voting on its next book. Put one up or cast your vote.`
    case "CLUB_VOTE_PICKED": return message ? `${name} picked ${message} as its next book.` : `${name} has picked its next book.`
    case "CLUB_VOTE_TIED": return message === NO_VOTES_MESSAGE
      ? `Nobody voted in ${name}'s vote. Pick the winner from the books put up.`
      : `The vote in ${name} is a tie. Pick the winner from the books level at the top.`
    case "CLUB_VOTE_CANCELLED": return message === ARCHIVED_MESSAGE
      ? `${name} was archived, so its vote on the next book is called off.`
      : `The vote on ${name}'s next book was called off.`
    default: return null
  }
}
export const isClubVoteNotification = (type: string) => type === "CLUB_VOTE_OPENED" || type === "CLUB_VOTE_PICKED" || type === "CLUB_VOTE_TIED" || type === "CLUB_VOTE_CANCELLED"
