// Club votes (BOO-49 phase 2): database work for the vote routes, the club page and the cron tick. The rules
// are in lib/clubVotes.ts (pure). Names on a vote (who nominated a book, who voted for it once it's closed)
// follow the club invite's rule (lib/clubs.ts inviteFaces): only public profiles, never someone the viewer
// has blocked or been blocked by, never a suspended account. Everyone else still counts, unnamed.
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { Prisma, type ClubVote, type NotificationType } from "@prisma/client";
import { createNotifications } from "@/lib/notifications";
import { coverToShare } from "@/lib/uploads";
import { sameBook } from "@/lib/workKey";
import { hiddenWhileSuspended } from "@/lib/suspension";
import { staffBadgeOf, staffBadgeSelect } from "@/lib/staffBadge";
import { canManageClub, clubRole, inviteFaces } from "@/lib/clubs";
import {
  ALREADY_UP_MESSAGE,
  READING_IT_MESSAGE,
  NOMINATIONS_FULL_MESSAGE,
  ARCHIVED_MESSAGE,
  NO_VOTES_MESSAGE,
  ONE_BOOK_EACH_MESSAGE,
  VOTE_ALREADY_OPEN_MESSAGE,
  VOTE_CLOSED_MESSAGE,
  SHORTLIST_OPEN_MESSAGE,
  SHORTLIST_UP_MESSAGE,
  canNominate,
  mayNominateMore,
  canRunVote,
  closesAtFor,
  countsVisible,
  isVoteDue,
  nominationAdmitted,
  tallyVotes,
  voteOutcome,
} from "@/lib/clubVotes";
import { blockedAmong, shelfBookFor } from "@/lib/buddyReadsServer";
import { findClubMembership } from "@/lib/clubsServer";
import { pageArgs, pages, type JobContext } from "@/lib/jobs/common";

type Result<T = object> = ({ ok: true } & T) | { ok: false, error: string, status: number }
const refuse = (error: string, status: number) => ({ ok: false as const, error, status })

// An ObjectId made here, so a new vote's openKey (its own id once settled) can be set without a second write.
const newObjectId = () => randomBytes(12).toString("hex")

// The vote the club page shows: the one open (or tied, waiting for a host), else the latest one closed whose
// winner hasn't been started yet. Null when there's nothing to show.
async function currentVote(clubId: string) {
  const live = await prisma.clubVote.findUnique({ where: { openKey: clubId } })
  if (live) return live
  const last = await prisma.clubVote.findFirst({ where: { clubId, status: "CLOSED" }, orderBy: { closedAt: "desc" } })
  if (!last?.winnerId || last.dismissedAt || await winnerStarted(last)) return null
  return last
}

// Whether the club has started the winning book since the vote closed: a club book of the same work (or
// title and author) begun after it.
async function winnerStarted(vote: ClubVote) {
  if (!vote.winnerId || !vote.closedAt) return false
  const winner = await prisma.clubNomination.findUnique({ where: { id: vote.winnerId }, select: { workKey: true, title: true, author: true } })
  if (!winner) return true
  const since = await prisma.buddyRead.findMany({ where: { clubId: vote.clubId, createdAt: { gte: vote.closedAt } }, select: { workKey: true, title: true, author: true } })
  return since.some((c) => sameBook(c, winner))
}

// ---- Reading ------------------------------------------------------------------------------

const voterSelect = { id: true, username: true, displayName: true, image: true, favColour: true, profileVisibility: true, suspendedAt: true, suspendedUntil: true, ...staffBadgeSelect } as const

export async function loadClubVote(clubId: string, viewerId: string) {
  const membership = await findClubMembership(clubId, viewerId)
  if (!membership) return null
  const { club, role, member } = membership

  let vote = await currentVote(club.id)
  // Due and nobody's tick has closed it yet: whoever looks first closes it.
  if (vote && isVoteDue(vote)) {
    await closeVote(vote)
    vote = await currentVote(club.id)
  }
  if (!vote) return { vote: null, viewer: viewerOf(null), nominations: [], reading: [] }

  const [nominations, ballots, memberRows, reading] = await Promise.all([
    prisma.clubNomination.findMany({ where: { voteId: vote.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.clubBallot.findMany({ where: { voteId: vote.id }, select: { userId: true, nominationId: true } }),
    prisma.clubMember.findMany({ where: { clubId: club.id }, select: { userId: true } }),
    clubBooksNow(club.id),
  ])
  const memberIds = new Set(memberRows.map((m) => m.userId))
  // A ballot left pointing at a book taken down at the same moment doesn't count, in turnout either.
  const up = new Set(nominations.map((n) => n.id))
  const counted = ballots.filter((b) => memberIds.has(b.userId) && up.has(b.nominationId))
  const visible = countsVisible(vote.status)
  const counts = tallyVotes(nominations.map((n) => n.id), counted, memberIds)

  // Everyone a name might be shown for: nominators, and voters once the counts are out.
  const peopleIds = Array.from(new Set([...nominations.map((n) => n.userId), ...(visible ? counted.map((b) => b.userId) : [])]))
  const [people, blocked] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: peopleIds } }, select: voterSelect }),
    blockedAmong(viewerId, peopleIds),
  ])
  const shown = new Map(inviteFaces(
    people.map((u) => ({ ...u, userId: u.id, suspended: hiddenWhileSuspended(u, viewerId) })),
    { hostId: club.hostId, viewerId, blocked },
  ).map((u) => [u.userId, { userId: u.userId, username: u.username, displayName: u.displayName, image: u.image, favColour: u.favColour, staffBadge: staffBadgeOf(u), isYou: u.userId === viewerId }]))

  const myBallot = counted.find((b) => b.userId === viewerId)?.nominationId ?? null
  const mine = nominations.filter((n) => n.userId === viewerId).length
  const running = canRunVote(role) && club.status === "ACTIVE"
  const open = vote.status === "OPEN"

  return {
    vote: {
      id: vote.id,
      status: vote.status,
      hostsOnly: vote.hostsOnly,
      closesAt: vote.closesAt.toISOString(),
      closedAt: vote.closedAt?.toISOString() ?? null,
      winnerId: vote.winnerId,
      tiedIds: vote.tiedIds,
      // Turnout is shown while it's open; which book is ahead isn't.
      voted: counted.length,
      memberCount: memberIds.size,
    },
    viewer: viewerOf({
      canRun: running,
      canNominate: open && club.status === "ACTIVE" && mayNominateMore(vote.hostsOnly, mine) && canNominate(role, { hostsOnly: vote.hostsOnly, muted: !!member.hostMutedAt }),
      canVote: open && club.status === "ACTIVE",
      myBallot,
      muted: !!member.hostMutedAt,
    }),
    nominations: nominations.map((n) => {
      const voters = visible ? counted.filter((b) => b.nominationId === n.id).map((b) => b.userId) : []
      const named = voters.flatMap((id) => shown.get(id) ?? [])
      return {
        id: n.id,
        // For "already up" in the put-up sheet, matched as the server matches it.
        workKey: n.workKey,
        title: n.title,
        author: n.author,
        coverImage: n.coverImage,
        cardColour: n.cardColour,
        // Null when they can't be named to this viewer (or have gone): the book still stands.
        nominatedBy: shown.get(n.userId) ?? null,
        isMine: n.userId === viewerId,
        // Their own nomination, while it's open; a host's or co-host's, any of them.
        removable: open && (n.userId === viewerId || running),
        votes: visible ? counts.get(n.id) ?? 0 : null,
        voters: visible ? named : null,
        otherVoters: visible ? voters.length - named.length : null,
      }
    }),
    // What the club is reading or about to start, which can't be put up for its next book.
    reading,
  }
}

// The club's books on now (reading, or set to start).
const clubBooksNow = (clubId: string) =>
  prisma.buddyRead.findMany({ where: { clubId, status: "ACTIVE" }, select: { workKey: true, title: true, author: true } })
export type ClubVoteView = NonNullable<Awaited<ReturnType<typeof loadClubVote>>>

function viewerOf(v: { canRun: boolean, canNominate: boolean, canVote: boolean, myBallot: string | null, muted: boolean } | null) {
  return v ?? { canRun: false, canNominate: false, canVote: false, myBallot: null, muted: false }
}

// ---- Running a vote -----------------------------------------------------------------------

// The vote the request is about, in the viewer's club, with their role. Not found looks the same as not
// being in the club.
export async function findVote(clubId: string, voteId: string, viewerId: string) {
  const membership = await findClubMembership(clubId, viewerId)
  if (!membership || !/^[a-f0-9]{24}$/i.test(voteId)) return null
  const vote = await prisma.clubVote.findUnique({ where: { id: voteId } })
  if (!vote || vote.clubId !== membership.club.id) return null
  return { vote, ...membership }
}

// One vote at a time: openKey is unique, so two hosts opening at once can't both succeed.
export async function openVote(clubId: string, openerId: string, opts: { days: number, hostsOnly: boolean }): Promise<Result<{ voteId: string }>> {
  const id = newObjectId()
  try {
    await prisma.clubVote.create({ data: { id, clubId, openedById: openerId, hostsOnly: opts.hostsOnly, closesAt: closesAtFor(opts.days), openKey: clubId } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return refuse(VOTE_ALREADY_OPEN_MESSAGE, 409)
    throw e
  }
  // A shortlist has nothing to vote on yet: the other hosts are asked to put books up, and members hear once
  // the first one is (nominate).
  await notifyClub(clubId, opts.hostsOnly
    ? { type: "CLUB_VOTE_OPENED", except: openerId, managersOnly: true, message: SHORTLIST_OPEN_MESSAGE }
    : { type: "CLUB_VOTE_OPENED", except: openerId })
  return { ok: true, voteId: id }
}

// A book from the nominator's shelf, as a snapshot. One each (on a hosts-only shortlist a host may put up
// several), ten at most, never the same book twice, and never a book the club is reading now. The last two are checked again after writing, so two
// at once can't make eleven, or put up one book twice.
export async function nominate(vote: ClubVote, userId: string, bookId: string): Promise<Result<{ nominationId: string }>> {
  if (vote.status !== "OPEN" || isVoteDue(vote)) return refuse(VOTE_CLOSED_MESSAGE, 409)
  const book = await prisma.book.findUnique({ where: { id: bookId } })
  if (!book || book.userId !== userId) return refuse("Book not found", 404)
  const [others, reading] = await Promise.all([
    prisma.clubNomination.findMany({ where: { voteId: vote.id }, select: { workKey: true, title: true, author: true } }),
    clubBooksNow(vote.clubId),
  ])
  if (reading.some((c) => sameBook(c, book))) return refuse(READING_IT_MESSAGE, 409)
  if (others.some((n) => sameBook(n, book))) return refuse(ALREADY_UP_MESSAGE, 409)

  let nominationId: string
  try {
    const row = await prisma.clubNomination.create({
      data: {
        voteId: vote.id,
        userId,
        workKey: book.workKey,
        title: book.title,
        author: book.author,
        // Every member sees it, so never the nominator's own upload: the catalogue's instead.
        coverImage: await coverToShare(book.coverImage, book, null),
        cardColour: book.cardColour,
        pages: book.pages,
        audioMinutes: book.progressUnit === "MINUTES" ? book.audioMinutes : null,
        // One each is held by the unique index; a shortlist's books each get their own slot.
        ...(vote.hostsOnly && { slot: randomBytes(12).toString("hex") }),
      },
      select: { id: true },
    })
    nominationId = row.id
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return refuse(ONE_BOOK_EACH_MESSAGE, 409)
    throw e
  }
  const order = await prisma.clubNomination.findMany({ where: { voteId: vote.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, workKey: true, title: true, author: true } })
  const at = order.findIndex((n) => n.id === nominationId)
  const refusal = !nominationAdmitted(order.map((n) => n.id), nominationId) ? NOMINATIONS_FULL_MESSAGE
    // The same book put up by someone else at the same moment: the first one stays.
    : order.slice(0, Math.max(at, 0)).some((n) => sameBook(n, book)) ? ALREADY_UP_MESSAGE
      : null
  if (refusal) {
    await prisma.clubNomination.delete({ where: { id: nominationId } })
    return refuse(refusal, 409)
  }
  if (vote.hostsOnly) {
    // A new vote has no shortlistUpAt stored at all, and on MongoDB a null filter only matches a stored null.
    const first = await prisma.clubVote.updateMany({ where: { id: vote.id, status: "OPEN", OR: [{ shortlistUpAt: null }, { shortlistUpAt: { isSet: false } }] }, data: { shortlistUpAt: new Date() } })
    if (first.count > 0) await notifyClub(vote.clubId, { type: "CLUB_VOTE_OPENED", membersOnly: true, message: SHORTLIST_UP_MESSAGE })
  }
  return { ok: true, nominationId }
}

// Taken down by whoever put it up, or by a host or co-host. Its votes go with it; those members can vote again.
export async function removeNomination(vote: ClubVote, nominationId: string, opts: { userId: string, canRun: boolean }): Promise<Result> {
  if (vote.status !== "OPEN") return refuse(VOTE_CLOSED_MESSAGE, 409)
  const nomination = await prisma.clubNomination.findUnique({ where: { id: nominationId } })
  if (!nomination || nomination.voteId !== vote.id) return refuse("That book isn't up for the vote any more.", 404)
  if (nomination.userId !== opts.userId && !opts.canRun) return refuse("Only the host or a co-host can take down someone else's book.", 403)
  await prisma.clubBallot.deleteMany({ where: { nominationId } })
  await prisma.clubNomination.delete({ where: { id: nominationId } })
  return { ok: true }
}

// One vote each, changed in place until it closes.
export async function castBallot(vote: ClubVote, userId: string, nominationId: string): Promise<Result> {
  if (vote.status !== "OPEN" || isVoteDue(vote)) return refuse(VOTE_CLOSED_MESSAGE, 409)
  const nomination = await prisma.clubNomination.findUnique({ where: { id: nominationId }, select: { voteId: true } })
  if (!nomination || nomination.voteId !== vote.id) return refuse("That book isn't up for the vote any more.", 404)
  try {
    await prisma.clubBallot.upsert({
      where: { voteId_userId: { voteId: vote.id, userId } },
      create: { voteId: vote.id, userId, nominationId },
      update: { nominationId },
    })
  } catch (e) {
    // Two taps at once: the other one made the row, so this one updates it.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e
    await prisma.clubBallot.update({ where: { voteId_userId: { voteId: vote.id, userId } }, data: { nominationId } })
  }
  // Taken down while this was written (removeNomination clears its ballots first): drop the ballot again.
  if (!(await prisma.clubNomination.findUnique({ where: { id: nominationId }, select: { id: true } }))) {
    await prisma.clubBallot.deleteMany({ where: { voteId: vote.id, userId, nominationId } })
    return refuse("That book isn't up for the vote any more.", 404)
  }
  return { ok: true }
}

// Closes it: on time (the cron tick, or the first to open the club after), or early by a host. Counts only
// current members. A clear winner is announced to everyone; a tie goes to the host and co-hosts to pick;
// no books at all and it's cancelled, quietly. The write is conditional on it still being open, so a tick
// and a host closing it at once announce it once.
export async function closeVote(vote: ClubVote): Promise<Result<{ status: ClubVote["status"] }>> {
  if (vote.status !== "OPEN") return refuse(VOTE_CLOSED_MESSAGE, 409)
  // An archived club starts nothing, so it picks nothing: a vote still on (archived as the tick ran) is called off.
  const club = await prisma.club.findUnique({ where: { id: vote.clubId }, select: { status: true } })
  if (club?.status !== "ACTIVE") {
    const cancelled = await cancelVote(vote, { archived: true })
    return cancelled.ok ? { ok: true, status: "CANCELLED" } : cancelled
  }
  const [nominations, ballots, members] = await Promise.all([
    prisma.clubNomination.findMany({ where: { voteId: vote.id }, select: { id: true, title: true } }),
    prisma.clubBallot.findMany({ where: { voteId: vote.id }, select: { userId: true, nominationId: true } }),
    prisma.clubMember.findMany({ where: { clubId: vote.clubId }, select: { userId: true } }),
  ])
  const outcome = voteOutcome(tallyVotes(nominations.map((n) => n.id), ballots, new Set(members.map((m) => m.userId))))
  const closedAt = new Date()
  const data: Prisma.ClubVoteUpdateManyMutationInput =
    outcome.kind === "winner" ? { status: "CLOSED", closedAt, winnerId: outcome.nominationId, openKey: vote.id }
      : outcome.kind === "tied" ? { status: "TIED", closedAt, tiedIds: outcome.nominationIds }
        : { status: "CANCELLED", closedAt, openKey: vote.id }
  const claimed = await prisma.clubVote.updateMany({ where: { id: vote.id, status: "OPEN" }, data })
  if (claimed.count === 0) return refuse(VOTE_CLOSED_MESSAGE, 409)
  // Archived between the check above and the write: the archive's own cancel found it settled and did
  // nothing, so it's called off here, and nobody is told the club picked a book it can't start.
  if (data.status !== "CANCELLED" && (await prisma.club.findUnique({ where: { id: vote.clubId }, select: { status: true } }))?.status !== "ACTIVE") {
    const cancelled = await callOff(vote, ["CLOSED", "TIED"], { archived: true })
    return cancelled.ok ? { ok: true, status: "CANCELLED" } : cancelled
  }

  if (outcome.kind === "winner") {
    const title = nominations.find((n) => n.id === outcome.nominationId)?.title ?? null
    await notifyClub(vote.clubId, { type: "CLUB_VOTE_PICKED", message: title })
  } else if (outcome.kind === "tied") {
    await notifyClub(vote.clubId, { type: "CLUB_VOTE_TIED", managersOnly: true, message: outcome.unvoted ? NO_VOTES_MESSAGE : null })
  }
  return { ok: true, status: data.status as ClubVote["status"] }
}

// A host or co-host breaks a tie: one of the books level at the top wins.
export async function pickWinner(vote: ClubVote, nominationId: string): Promise<Result> {
  if (vote.status !== "TIED") return refuse("There's no tie to break.", 409)
  if (!vote.tiedIds.includes(nominationId)) return refuse("Pick one of the books that tied.", 400)
  const claimed = await prisma.clubVote.updateMany({ where: { id: vote.id, status: "TIED" }, data: { status: "CLOSED", winnerId: nominationId, openKey: vote.id } })
  if (claimed.count === 0) return refuse("Someone else has already picked.", 409)
  const winner = await prisma.clubNomination.findUnique({ where: { id: nominationId }, select: { title: true } })
  await notifyClub(vote.clubId, { type: "CLUB_VOTE_PICKED", message: winner?.title ?? null })
  return { ok: true }
}

// Called off by a host or co-host, or by archiving the club. Everyone else in the club is told, and the
// vote's "cast your vote" rows come out of their bells (one vote at a time, so the club's are this one's).
export const cancelVote = (vote: ClubVote, opts: { by?: string, archived?: boolean } = {}) => callOff(vote, ["OPEN", "TIED"], opts)

async function callOff(vote: ClubVote, from: ClubVote["status"][], opts: { by?: string, archived?: boolean }): Promise<Result> {
  const claimed = await prisma.clubVote.updateMany({ where: { id: vote.id, status: { in: from } }, data: { status: "CANCELLED", closedAt: new Date(), winnerId: null, tiedIds: [], openKey: vote.id } })
  if (claimed.count === 0) return refuse(VOTE_CLOSED_MESSAGE, 409)
  await prisma.notification.deleteMany({ where: { clubId: vote.clubId, type: { in: ["CLUB_VOTE_OPENED", "CLUB_VOTE_TIED"] } } })
  await notifyClub(vote.clubId, { type: "CLUB_VOTE_CANCELLED", except: opts.by, message: opts.archived ? ARCHIVED_MESSAGE : null })
  return { ok: true }
}

// The club is archived: whatever vote it has on, or a tie waiting, is called off.
export async function cancelClubVote(clubId: string, by: string) {
  const live = await prisma.clubVote.findUnique({ where: { openKey: clubId } })
  if (live) await cancelVote(live, { by, archived: true })
}

// A host puts the winner card away without starting the book (they changed their minds, or started
// something else): the club page stops showing it. The vote and its counts stay as they were.
export async function dismissWinner(vote: ClubVote): Promise<Result> {
  if (vote.status !== "CLOSED" || !vote.winnerId) return refuse("This vote hasn't picked a book yet.", 409)
  await prisma.clubVote.update({ where: { id: vote.id }, data: { dismissedAt: new Date() } })
  return { ok: true }
}

// "Start this book": the winner on the starter's shelf (their copy, or a new one in Want to read), so the
// usual start form can take it from there with its dates.
export async function winnerCopyFor(vote: ClubVote, userId: string): Promise<Result<{ bookId: string }>> {
  if (vote.status !== "CLOSED" || !vote.winnerId) return refuse("This vote hasn't picked a book yet.", 409)
  const winner = await prisma.clubNomination.findUnique({ where: { id: vote.winnerId } })
  if (!winner) return refuse("That book isn't there any more.", 404)
  const { bookId } = await shelfBookFor(userId, winner, { byClub: true })
  return { ok: true, bookId }
}

// ---- Notifications ------------------------------------------------------------------------

// Everyone in the club (or only its host and co-hosts), together. A vote is the club's, not one person's,
// so nobody is named: actorId is the reader themselves (packages/shared/src/push.ts pushes them anyway).
// That also keeps a blocked opener's name away from whoever blocked them.
// managersOnly: the host and co-hosts; membersOnly: everyone else.
async function notifyClub(clubId: string, n: { type: NotificationType, except?: string, managersOnly?: boolean, membersOnly?: boolean, message?: string | null }) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { hostId: true } })
  if (!club) return
  const members = await prisma.clubMember.findMany({ where: { clubId }, select: { userId: true, coHost: true } })
  const to = members.filter((m) => {
    if (m.userId === n.except) return false
    const manager = canManageClub(clubRole(m, club.hostId))
    return n.managersOnly ? manager : n.membersOnly ? !manager : true
  })
  await createNotifications(to.map((m) => ({ userId: m.userId, actorId: m.userId, type: n.type, clubId, message: n.message ?? null })))
}

// ---- The cron tick ------------------------------------------------------------------------

// Closes every vote whose time is up, so the result goes out on time even if nobody opens the club.
export async function runClubVotes(ctx: JobContext): Promise<{ votesClosed: number }> {
  let closed = 0
  const due = (after: string | undefined) => prisma.clubVote.findMany({ where: { status: "OPEN", closesAt: { lte: ctx.now } }, ...pageArgs(after) })
  for await (const votes of pages(ctx, due)) {
    for (const vote of votes) {
      const result = await closeVote(vote)
      if (result.ok) closed++
    }
  }
  return { votesClosed: closed }
}
