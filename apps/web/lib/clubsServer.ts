// Book clubs (BOO-49): database work for the API routes and pages. The rules are in lib/clubs.ts (pure).
// A club's books are ordinary reading circles with clubId set, and club members are ordinary circle members,
// so the spoiler lock, the checkpoint reminders and the weekly email (lib/jobs/) need nothing new: this file
// only decides who is added to which circle, and when.
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { Prisma, type BuddyRead, type Club } from "@prisma/client";
import { staffBadgeOf, staffBadgeSelect } from "@/lib/staffBadge";
import { booksReadCount, booksReadOf } from "@/lib/readerTier";
import { BUDDY_READ_MAX_MEMBERS, circleProgress, makeInviteCode, progressPercent } from "@/lib/buddyReads";
import { CLUB_MAX_MEMBERS, canManageClub, clubAllowance, clubRole, clubShelf, inviteFaces, inviteHost, type ClubRole } from "@/lib/clubs";
import { hiddenWhileSuspended } from "@/lib/suspension";
import { withinClubCap } from "@/lib/clubLimits";
export { finishClubBooks } from "@/lib/clubLimits";
import { progressSelect } from "@/lib/progress";
import {
  blockedAmong,
  buddyReadError,
  handOverHosting,
  hostingPlanOf,
  isBlockedEitherWay,
  isObjectId,
  shelfBookFor,
  successorFor,
  wasRemoved,
} from "@/lib/buddyReadsServer";

export const clubError = buddyReadError

export async function newClubInviteCode() {
  for (let i = 0; i < 5; i++) {
    const code = makeInviteCode((n) => randomBytes(n))
    if (!(await prisma.club.findUnique({ where: { inviteCode: code }, select: { id: true } }))) return code
  }
  throw new Error("Couldn't make a unique invite code")
}

// May this reader start another club? Free accounts host one active club, Plus any number (lib/clubs.ts).
export async function canHostAnotherClub(userId: string) {
  const [active, plan] = await Promise.all([
    prisma.club.count({ where: { hostId: userId, status: "ACTIVE" } }),
    hostingPlanOf(userId),
  ])
  return clubAllowance(active, plan)
}

// A club and the viewer's place in it, or null if they aren't in it. Not found and not a member look the
// same from outside, so ids can't be probed.
export async function findClubMembership(clubId: string, userId: string) {
  if (!isObjectId(clubId)) return null
  const member = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId } }, include: { club: true } })
  if (!member) return null
  const role = clubRole(member, member.club.hostId)
  return { member, club: member.club, role, canManage: canManageClub(role) && member.club.status === "ACTIVE" }
}

// Someone's role in the club, or null if they aren't in it.
export async function clubRoleOf(clubId: string, userId: string): Promise<ClubRole | null> {
  const [club, member] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { hostId: true } }),
    prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId } }, select: { userId: true, coHost: true } }),
  ])
  return club && member ? clubRole(member, club.hostId) : null
}

export async function requireClubMembership(clubId: string, userId: string) {
  const membership = await findClubMembership(clubId, userId)
  if (!membership) return { membership: null, response: clubError("Club not found", 404) } as const
  return { membership, response: null } as const
}

// The club's open circles: the book it's reading and the one coming up.
const openCircles = (clubId: string) => prisma.buddyRead.findMany({ where: { clubId, status: "ACTIVE" } })

const userSelect = { id: true, username: true, displayName: true, image: true, favColour: true, ...booksReadCount, ...staffBadgeSelect } as const

// ---- The club page ------------------------------------------------------------------------

// Members, roles and the club's books. Nothing from inside a circle beyond each member's own place in it:
// the discussion stays on the circle's page, behind its lock.
export async function loadClubView(clubId: string, viewerId: string) {
  const membership = await findClubMembership(clubId, viewerId)
  if (!membership) return null
  const { club, role, canManage } = membership

  const [memberRows, circles] = await Promise.all([
    prisma.clubMember.findMany({ where: { clubId }, orderBy: { joinedAt: "asc" } }),
    prisma.buddyRead.findMany({ where: { clubId }, orderBy: { startsAt: "desc" }, take: 100 }),
  ])
  const [users, blocked, myCircleRows, counts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: memberRows.map((m) => m.userId) } }, select: userSelect }),
    blockedAmong(viewerId, memberRows.map((m) => m.userId)),
    prisma.buddyReadMember.findMany({ where: { userId: viewerId, buddyReadId: { in: circles.map((c) => c.id) } }, select: { buddyReadId: true, bookId: true, notifiedProgress: true } }),
    prisma.buddyReadMember.groupBy({ by: ["buddyReadId"], where: { buddyReadId: { in: circles.map((c) => c.id) } }, _count: { _all: true } }),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const myBooks = await prisma.book.findMany({ where: { id: { in: myCircleRows.map((m) => m.bookId) }, userId: viewerId }, select: { id: true, ...progressSelect } })
  const myBookById = new Map(myBooks.map((b) => [b.id, b]))
  const mine = new Map(myCircleRows.map((m) => {
    const book = myBookById.get(m.bookId)
    return [m.buddyReadId, circleProgress(book ? progressPercent(book) : 0, m.notifiedProgress)]
  }))
  const countById = new Map(counts.map((c) => [c.buddyReadId, c._count._all]))

  const members = memberRows.flatMap((m) => {
    const user = userById.get(m.userId)
    if (!user || blocked.has(m.userId)) return []
    return [{
      userId: m.userId,
      username: user.username,
      displayName: user.displayName,
      image: user.image,
      favColour: user.favColour,
      staffBadge: staffBadgeOf(user),
      booksRead: booksReadOf(user),
      role: clubRole(m, club.hostId),
      isYou: m.userId === viewerId,
      joinedAt: m.joinedAt.toISOString(),
    }]
  })

  const summary = (c: BuddyRead) => ({
    id: c.id,
    title: c.title,
    author: c.author,
    coverImage: c.coverImage,
    cardColour: c.cardColour,
    status: c.status,
    startsAt: c.startsAt.toISOString(),
    memberCount: countById.get(c.id) ?? 0,
    // Only a member can open a circle; someone who joined the club after it ended sees it in the list only.
    isMember: mine.has(c.id),
    myProgress: mine.get(c.id) ?? null,
  })
  const shelf = clubShelf(circles)

  return {
    club: {
      id: club.id,
      name: club.name,
      about: club.about,
      status: club.status,
      hostId: club.hostId,
      createdAt: club.createdAt.toISOString(),
      // Members can share the link; anyone with it can join.
      inviteCode: club.status === "ACTIVE" ? club.inviteCode : null,
    },
    viewer: { userId: viewerId, role, canManage },
    members,
    reading: shelf.reading.map(summary),
    upcoming: shelf.upcoming.map(summary),
    past: shelf.past.map(summary),
  }
}
export type ClubView = NonNullable<Awaited<ReturnType<typeof loadClubView>>>

// What the club's invite page shows, signed in or not: the club, its host and who's in, and the cover of
// what it's reading and what's next. Nothing from inside a circle. The link gets forwarded, so it shows only
// members a stranger could see anyway (lib/clubs.ts inviteFaces); the rest are counted, not named.
export async function loadClubInvite(code: string, viewerId?: string | null) {
  if (!/^[a-z0-9]{6,20}$/.test(code)) return null
  const club = await prisma.club.findUnique({ where: { inviteCode: code } })
  if (!club || club.status !== "ACTIVE") return null
  const [memberRows, circles] = await Promise.all([
    prisma.clubMember.findMany({ where: { clubId: club.id }, orderBy: { joinedAt: "asc" }, select: { userId: true } }),
    prisma.buddyRead.findMany({ where: { clubId: club.id }, orderBy: { startsAt: "desc" }, take: 50 }),
  ])
  const [users, blocked] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: memberRows.map((m) => m.userId) } }, select: { ...userSelect, profileVisibility: true, suspendedAt: true, suspendedUntil: true } }),
    viewerId ? blockedAmong(viewerId, memberRows.map((m) => m.userId)) : Promise.resolve(new Set<string>()),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const everyone = memberRows.flatMap((m) => {
    const u = userById.get(m.userId)
    return u ? [{
      userId: u.id, username: u.username, displayName: u.displayName, image: u.image, favColour: u.favColour, staffBadge: staffBadgeOf(u), booksRead: booksReadOf(u),
      profileVisibility: u.profileVisibility, suspended: hiddenWhileSuspended(u, viewerId),
    }] : []
  })
  const faces = inviteFaces(everyone, { hostId: club.hostId, viewerId, blocked })
  const members = faces.map(({ profileVisibility: _v, suspended: _s, ...m }) => m)
  const hostRow = inviteHost(everyone, club.hostId, { viewerId, blocked })
  const host = hostRow ? (({ profileVisibility: _v, suspended: _s, ...m }) => m)(hostRow) : null
  const shelf = clubShelf(circles)
  const book = (c: BuddyRead | undefined) => c ? { title: c.title, author: c.author, coverImage: c.coverImage, cardColour: c.cardColour, startsAt: c.startsAt.toISOString() } : null
  return {
    club,
    host,
    members,
    current: book(shelf.reading[0]),
    next: book(shelf.upcoming[0]),
    booksRead: shelf.past.length,
    memberCount: everyone.length,
    full: everyone.length >= CLUB_MAX_MEMBERS,
  }
}

// ---- Joining ------------------------------------------------------------------------------

export const CLUB_REMOVED_MESSAGE = "You were removed from this club, so the invite link won't let you back in."
export async function wasRemovedFromClub(clubId: string, userId: string) {
  return !!(await prisma.clubRemoval.findUnique({ where: { clubId_userId: { clubId, userId } }, select: { id: true } }))
}

// Adds a club member to one of the club's circles, as joining it would: their own shelf copy (in Want to
// read: lib/clubs.ts CLUB_COPY_STATUS) and a membership starting from their progress. Skipped, quietly, for a
// circle they're already in, one whose host they've blocked (or who blocked them), one they were removed
// from, or a full one. Returns whether they were added.
export async function addToClubCircle(circle: BuddyRead, userId: string) {
  if (circle.status !== "ACTIVE") return false
  if (await prisma.buddyReadMember.findUnique({ where: { buddyReadId_userId: { buddyReadId: circle.id, userId } }, select: { id: true } })) return false
  if (await isBlockedEitherWay(userId, circle.hostId)) return false
  if (await wasRemoved(circle.id, userId)) return false
  if ((await prisma.buddyReadMember.count({ where: { buddyReadId: circle.id } })) >= BUDDY_READ_MAX_MEMBERS) return false

  const { bookId } = await shelfBookFor(userId, circle, { byClub: true })
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, ...progressSelect } })
  try {
    // Starting from their progress means a book already finished never counts as a finished reading circle.
    await prisma.buddyReadMember.create({ data: { buddyReadId: circle.id, userId, bookId, notifiedProgress: progressPercent(book) } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false
    throw e
  }
  await prisma.buddyReadInvite.deleteMany({ where: { buddyReadId: circle.id, inviteeId: userId } })
  return true
}

export type ClubJoinResult =
  | { ok: true, clubId: string, alreadyMember: boolean, circleIds: string[] }
  | { ok: false, error: string, status: number }

// Joining once is joining every book: the club's open circles take them in straight away, and each book
// started after this adds them too (startClubCircle).
export async function joinClub(club: Club, userId: string): Promise<ClubJoinResult> {
  if (club.status !== "ACTIVE") return { ok: false, error: "This club has closed.", status: 410 }
  const existing = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId } }, select: { id: true } })
  if (!existing) {
    if (await isBlockedEitherWay(userId, club.hostId)) return { ok: false, error: "You can't join this club.", status: 403 }
    if (await wasRemovedFromClub(club.id, userId)) return { ok: false, error: CLUB_REMOVED_MESSAGE, status: 403 }
    const count = await prisma.clubMember.count({ where: { clubId: club.id } })
    if (count >= CLUB_MAX_MEMBERS) return { ok: false, error: `This club is full (${CLUB_MAX_MEMBERS} readers).`, status: 409 }
    try {
      await prisma.clubMember.create({ data: { clubId: club.id, userId } })
    } catch (e) {
      // A double click: the other request already joined.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e
    }
    // The count above can race another join: check again now both are written, and the later one backs out.
    if (!(await withinClubCap(club.id, userId, prisma))) {
      await prisma.clubMember.deleteMany({ where: { clubId: club.id, userId } })
      return { ok: false, error: `This club is full (${CLUB_MAX_MEMBERS} readers).`, status: 409 }
    }
  }
  // A member who left a circle on purpose stays out of it: only a new member is added to the open ones.
  const circleIds: string[] = []
  if (!existing) {
    for (const circle of await openCircles(club.id)) {
      if (await addToClubCircle(circle, userId)) circleIds.push(circle.id)
    }
  }
  return { ok: true, clubId: club.id, alreadyMember: !!existing, circleIds }
}

// ---- The next book ------------------------------------------------------------------------

// A host or co-host started the club's next book (lib/buddyReadsServer.ts createCircle, with clubId): every
// other member is added and told. Those who can't be (blocked by the starter) are skipped.
export async function addClubToCircle(circle: BuddyRead, clubId: string, starterId: string) {
  const members = await prisma.clubMember.findMany({ where: { clubId, userId: { not: starterId } }, orderBy: { joinedAt: "asc" }, select: { userId: true } })
  for (const m of members) {
    if (!(await addToClubCircle(circle, m.userId))) continue
    await createNotification({ userId: m.userId, actorId: starterId, type: "CLUB_CIRCLE_ADDED", buddyReadId: circle.id, count: 1 })
  }
}

// ---- Leaving ------------------------------------------------------------------------------

// Someone leaves the club, or is removed. They leave its open circles too (the books they finished stay in
// their history). A circle they were hosting passes to the club's host, or if the host isn't reading it, to
// its longest-standing member (it ends if nobody else is in it). A removal sticks, for the club and
// those circles, so the links won't let them back in.
export async function leaveClub(club: Club, userId: string, opts: { removedBy?: string, newHost?: string }) {
  if (club.hostId === userId) {
    if (!opts.newHost) throw new Error("A host leaves by handing the club on")
    await prisma.club.update({ where: { id: club.id }, data: { hostId: opts.newHost } })
    // The new host is the host now, not a co-host as well.
    await prisma.clubMember.updateMany({ where: { clubId: club.id, userId: opts.newHost }, data: { coHost: false } })
  }
  const clubHost = opts.newHost ?? club.hostId
  for (const circle of await openCircles(club.id)) {
    if (circle.hostId === userId) {
      const hostIn = clubHost !== userId && await prisma.buddyReadMember.findUnique({ where: { buddyReadId_userId: { buddyReadId: circle.id, userId: clubHost } }, select: { id: true } })
      const next = hostIn ? { userId: clubHost, archive: false } : await successorFor(circle, userId)
      if (next) await handOverHosting(circle, next.userId, { from: opts.removedBy ?? userId, archive: next.archive })
      else await prisma.buddyRead.update({ where: { id: circle.id }, data: { status: "ARCHIVED" } })
    }
    const removed = await prisma.buddyReadMember.deleteMany({ where: { buddyReadId: circle.id, userId } })
    if (opts.removedBy && removed.count > 0) {
      await prisma.buddyReadRemoval.upsert({
        where: { buddyReadId_userId: { buddyReadId: circle.id, userId } },
        create: { buddyReadId: circle.id, userId },
        update: { removedAt: new Date() },
      })
    }
  }
  await prisma.clubMember.deleteMany({ where: { clubId: club.id, userId } })
  if (opts.removedBy) {
    await prisma.clubRemoval.upsert({
      where: { clubId_userId: { clubId: club.id, userId } },
      create: { clubId: club.id, userId },
      update: { removedAt: new Date() },
    })
  }
}

// ---- Account deletion ---------------------------------------------------------------------

type Db = Prisma.TransactionClient

// Club rows reference users by id, so account deletion clears them (through deleteBuddyReadDataFor, inside its
// transaction). A club they host passes to its longest-standing co-host, else its longest-standing member. With
// nobody left it's deleted, and its books stay as ordinary circles.
export async function deleteClubDataFor(userId: string, db: Db = prisma) {
  const hosted = await db.club.findMany({ where: { hostId: userId }, select: { id: true } })
  for (const club of hosted) {
    const others = await db.clubMember.findMany({ where: { clubId: club.id, userId: { not: userId } }, orderBy: { joinedAt: "asc" }, select: { userId: true, coHost: true } })
    const existing = new Set((await db.user.findMany({ where: { id: { in: others.map((m) => m.userId) } }, select: { id: true } })).map((u) => u.id))
    const candidates = others.filter((m) => existing.has(m.userId))
    const next = candidates.find((m) => m.coHost) ?? candidates[0]
    if (next) {
      await db.club.update({ where: { id: club.id }, data: { hostId: next.userId } })
      await db.clubMember.updateMany({ where: { clubId: club.id, userId: next.userId }, data: { coHost: false } })
    } else {
      await db.buddyRead.updateMany({ where: { clubId: club.id }, data: { clubId: null } })
      await db.clubMember.deleteMany({ where: { clubId: club.id } })
      await db.clubRemoval.deleteMany({ where: { clubId: club.id } })
      await db.club.delete({ where: { id: club.id } })
    }
  }
  await db.clubMember.deleteMany({ where: { userId } })
  await db.clubRemoval.deleteMany({ where: { userId } })
}

export type { ClubRole }
