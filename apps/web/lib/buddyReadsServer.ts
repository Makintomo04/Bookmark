// Reading circles: database work for the API routes and pages. The rules and the spoiler lock itself
// live in lib/buddyReads.ts (pure, so they can be checked without a database).
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushes } from "@/lib/push";
import { Prisma, type Book, type BuddyRead, type NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { awardNewAchievements } from "@/lib/achievements";
import { catalogIds, linkCatalog } from "@/lib/catalog";
import { readFromBook } from "@/lib/readHistory";
import { booksReadCount, booksReadOf } from "@/lib/readerTier";
import { staffBadgeOf, staffBadgeSelect } from "@/lib/staffBadge";
import { sameBook } from "@/lib/workKey";
import { coverToShare } from "@/lib/uploads";
import { hiddenWhileSuspended } from "@/lib/suspension";
import {
  BUDDY_READ_MAX_MEMBERS,
  circleProgress,
  hostingAllowance,
  inheritedAllowance,
  makeInviteCode,
  newCommentRecipients,
  progressPercent,
  scheduleSchema,
  serializeComments,
  unlockedByProgress,
  type BuddyReadSchedule,
  type CommentAuthors,
  type HostingAllowance,
  type HostingPlan,
} from "@/lib/buddyReads";
import { progressScale, progressSelect, unitOf } from "@/lib/progress";
import { CLUB_COPY_STATUS, canRemoveFromClubBook, clubRole, inviteFaces, inviteHost } from "@/lib/clubs";
import { EntitlementError, entitlementsOf, entitlementsSelect } from "@/lib/entitlements";
import { entitlementResponse } from "@/lib/entitlementsServer";

export const isObjectId = (id: string | null | undefined): id is string => !!id && /^[a-f0-9]{24}$/i.test(id)

// Blocked users can't join each other's reading circles, invite each other, or see each other's progress
// and comments. Every reading circle path that pairs two readers goes through here.
export async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return false
  const block = await prisma.block.findFirst({
    where: { OR: [{ blockerId: userA, blockedId: userB }, { blockerId: userB, blockedId: userA }] },
    select: { id: true },
  })
  return !!block
}

// The readers among `others` that the viewer has blocked or been blocked by, in one query.
export async function blockedAmong(viewerId: string, others: string[]): Promise<Set<string>> {
  const ids = others.filter((id) => id !== viewerId)
  if (ids.length === 0) return new Set()
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId, blockedId: { in: ids } }, { blockedId: viewerId, blockerId: { in: ids } }] },
    select: { blockerId: true, blockedId: true },
  })
  return new Set(blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)))
}

export const buddyReadError = (error: string, status: number) => NextResponse.json({ error }, { status })

// Route handlers: const parsed = await parseBody(req, schema); if (parsed.response) return parsed.response
export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<
  { data: z.infer<T>, response: null } | { data: null, response: NextResponse }
> {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (parsed.success) return { data: parsed.data, response: null }
  return { data: null, response: buddyReadError(parsed.error.issues[0]?.message ?? "Invalid request", 400) }
}

// The membership for a route under /api/buddy-reads/[id], or a 404 (not found and not a member look alike).
export async function requireMembership(buddyReadId: string, userId: string) {
  const membership = await findMembership(buddyReadId, userId)
  if (!membership) return { membership: null, response: buddyReadError("Reading circle not found", 404) } as const
  return { membership, response: null } as const
}

export function parseSchedule(raw: Prisma.JsonValue | null | undefined): BuddyReadSchedule {
  const parsed = scheduleSchema.safeParse(raw)
  return parsed.success ? parsed.data : []
}

export async function newInviteCode() {
  for (let i = 0; i < 5; i++) {
    const code = makeInviteCode((n) => randomBytes(n))
    if (!(await prisma.buddyRead.findUnique({ where: { inviteCode: code }, select: { id: true } }))) return code
  }
  throw new Error("Couldn't make a unique invite code")
}

const userSelect = { id: true, username: true, displayName: true, image: true, favColour: true, ...booksReadCount } as const
const suspensionSelect = { suspendedAt: true, suspendedUntil: true } as const

type ProgressBook = Pick<Book, "id" | "status" | "currentPage" | "pages" | "progressUnit" | "currentMinute" | "audioMinutes">
const progressBookSelect = { id: true, ...progressSelect } as const

// ---- Hosting ------------------------------------------------------------------------------

// MongoDB: `inheritedAt: null` alone misses circles that never had the field set, which is most of them.
// A club's circles count against the club's limits instead (lib/clubs.ts), so neither cap counts them.
const notInClub = { OR: [{ clubId: null }, { clubId: { isSet: false } }] } satisfies Prisma.BuddyReadWhereInput
const startedByHost = { AND: [{ OR: [{ inheritedAt: null }, { inheritedAt: { isSet: false } }] }, notInClub] } satisfies Prisma.BuddyReadWhereInput
const inheritedByHost = { AND: [{ inheritedAt: { not: null } }, notInClub] } satisfies Prisma.BuddyReadWhereInput

export async function hostingPlanOf(userId: string): Promise<HostingPlan> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: entitlementsSelect })
  return entitlementsOf(user ?? {}).canHostUnlimited ? "plus" : "free"
}

// May this reader start another circle? Free accounts host one active circle at a time and Plus has
// no limit (the rule is hostingAllowance() in lib/buddyReads.ts); joining is never limited. Circles
// handed on to them don't count. The create route refuses with `message` when not allowed.
export async function canHostAnotherCircle(userId: string): Promise<HostingAllowance> {
  const [active, plan] = await Promise.all([
    prisma.buddyRead.count({ where: { hostId: userId, status: "ACTIVE", ...startedByHost } }),
    hostingPlanOf(userId),
  ])
  return hostingAllowance(active, plan)
}

// May this reader take on (or reopen) another active circle handed on to them? A separate cap from the
// circles they start: inheritedAllowance() in lib/buddyReads.ts.
export async function canInheritAnotherCircle(userId: string): Promise<HostingAllowance> {
  const [active, plan] = await Promise.all([
    prisma.buddyRead.count({ where: { hostId: userId, status: "ACTIVE", ...inheritedByHost } }),
    hostingPlanOf(userId),
  ])
  return inheritedAllowance(active, plan)
}

// The response for a refused HostingAllowance: a 402 with the upgrade body when Plus would lift the
// limit (lib/entitlements.ts), so clients show the upgrade prompt; otherwise a plain 403.
export function hostingRefusal(hosting: HostingAllowance): NextResponse {
  const message = hosting.message ?? "You can't host another circle right now."
  return hosting.upgrade ? entitlementResponse(new EntitlementError("canHostUnlimited", message)) : buddyReadError(message, 403)
}

// A reading circle and the viewer's membership, or null if they aren't in it. Not found and not a member
// look the same from outside, so ids can't be probed.
export async function findMembership(buddyReadId: string, userId: string) {
  if (!isObjectId(buddyReadId)) return null
  const member = await prisma.buddyReadMember.findUnique({
    where: { buddyReadId_userId: { buddyReadId, userId } },
    include: { buddyRead: true },
  })
  if (!member) return null
  const book = await prisma.book.findUnique({ where: { id: member.bookId }, select: { ...progressBookSelect, userId: true } })
  // A book removed from the shelf, or a re-read back at page 1, keeps everything the member already reached.
  const progress = circleProgress(book && book.userId === userId ? progressPercent(book) : 0, member.notifiedProgress)
  const isHost = member.buddyRead.hostId === userId
  const club = member.buddyRead.clubId && !isHost ? await clubManagerOf(member.buddyRead.clubId, userId) : null
  // In a club's circle the club's host and co-hosts can run it too: the schedule, finishing it, inviting.
  const canManage = isHost || (!!club?.manager && club.active)
  // Moderating (deleting comments, removing readers) outlasts the club: an archived club's books stay open
  // for talk (lib/clubLimits.ts finishClubBooks), so its host and co-hosts keep these powers there.
  const canModerate = isHost || !!club?.manager
  return { member, buddyRead: member.buddyRead, progress, isHost, canManage, canModerate }
}

// Whether this reader is the club's host or one of its co-hosts (lib/clubs.ts canManageClub), and whether
// the club is still active.
export async function clubManagerOf(clubId: string, userId: string) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { hostId: true, status: true } })
  if (!club) return { manager: false, active: false }
  const active = club.status === "ACTIVE"
  if (club.hostId === userId) return { manager: true, active }
  const coHost = await prisma.clubMember.findFirst({ where: { clubId, userId, coHost: true }, select: { id: true } })
  return { manager: !!coHost, active }
}

// Everyone's role in the club, by user id. Someone no longer in the club isn't in the map.
async function clubRolesOf(clubId: string) {
  const [club, members] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { hostId: true } }),
    prisma.clubMember.findMany({ where: { clubId }, select: { userId: true, coHost: true } }),
  ])
  return new Map(club ? members.map((m) => [m.userId, clubRole(m, club.hostId)] as const) : [])
}

async function isOwnBook(bookId: string, userId: string) {
  return !!(await prisma.book.findFirst({ where: { id: bookId, userId }, select: { id: true } }))
}

// Members, progress and the spoiler-locked discussion, as this viewer may see it.
export async function loadBuddyReadView(buddyReadId: string, viewerId: string) {
  const membership = await findMembership(buddyReadId, viewerId)
  if (!membership) return null
  const { buddyRead, progress, isHost, canManage, canModerate } = membership

  const memberRows = await prisma.buddyReadMember.findMany({ where: { buddyReadId }, orderBy: { joinedAt: "asc" } })
  const [users, books, clubRoles] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: memberRows.map((m) => m.userId) } }, select: { ...userSelect, ...staffBadgeSelect, ...suspensionSelect } }),
    prisma.book.findMany({ where: { id: { in: memberRows.map((m) => m.bookId) } }, select: { ...progressBookSelect, userId: true } }),
    buddyRead.clubId ? clubRolesOf(buddyRead.clubId) : Promise.resolve(null),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const bookById = new Map(books.map((b) => [b.id, b]))
  // Who the viewer may remove, as the removal route decides it (app/api/buddy-reads/[id]/members/[userId]):
  // never the book's host, and in a club's book only as the club's roles allow.
  const viewerClubRole = clubRoles?.get(viewerId) ?? null
  const removable = (userId: string) => canModerate && userId !== viewerId && userId !== buddyRead.hostId
    && (!clubRoles || canRemoveFromClubBook(viewerClubRole, clubRoles.get(userId) ?? null, false))

  const rows = await prisma.buddyReadComment.findMany({
    where: { buddyReadId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: 2000,
    include: { reactions: { select: { userId: true, emoji: true } } },
  })
  // Writers who are no longer members: those who left keep their name, closed accounts become "former member".
  // (A membership whose account is gone counts as a past writer too: its comments show as a former member's.)
  const pastWriterIds = Array.from(new Set(rows.map((r) => r.userId).filter((id) => !userById.has(id))))
  const [pastWriters, blocked] = await Promise.all([
    pastWriterIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: pastWriterIds } }, select: { id: true, username: true, displayName: true, image: true, favColour: true, ...staffBadgeSelect, ...suspensionSelect } })
      : Promise.resolve([]),
    blockedAmong(viewerId, [...memberRows.map((m) => m.userId), ...pastWriterIds]),
  ])

  const members = memberRows.flatMap((m) => {
    const user = userById.get(m.userId)
    // Deleted accounts and blocked readers drop out of the track and the discussion.
    if (!user || blocked.has(m.userId)) return []
    const book = bookById.get(m.bookId)
    return [{
      userId: m.userId,
      username: user.username,
      displayName: user.displayName,
      image: user.image,
      favColour: user.favColour,
      staffBadge: staffBadgeOf(user),
      booksRead: booksReadOf(user),
      progress: circleProgress(book && book.userId === m.userId ? progressPercent(book) : 0, m.notifiedProgress),
      isHost: m.userId === buddyRead.hostId,
      // In a club's book: their role in the club ("host" is the club's host, not whoever started the book).
      clubRole: clubRoles?.get(m.userId) ?? null,
      removable: removable(m.userId),
      isYou: m.userId === viewerId,
      joinedAt: m.joinedAt.toISOString(),
      finishedAt: m.finishedAt?.toISOString() ?? null,
    }]
  })

  // Each writer's staff seal rides with their comments; the role fields it comes from stay here.
  const authors: CommentAuthors = new Map(members.map((m) => [m.userId, { username: m.username, displayName: m.displayName, image: m.image, favColour: m.favColour, staffBadge: staffBadgeOf(userById.get(m.userId)) }]))
  const pastWriterById = new Map(pastWriters.map((u) => [u.id, u]))
  for (const id of pastWriterIds) {
    if (blocked.has(id)) continue
    const u = pastWriterById.get(id)
    authors.set(id, u ? { username: u.username, displayName: u.displayName, image: u.image, favColour: u.favColour, staffBadge: staffBadgeOf(u) } : null)
  }
  // A suspended writer's comments drop out for everyone else, like a blocked one's, until it ends.
  for (const u of [...users, ...pastWriters]) {
    if (hiddenWhileSuspended(u, viewerId)) authors.delete(u.id)
  }
  // The lock runs here, on the server: bodies past the viewer's progress never leave this function.
  const comments = serializeComments(rows, { userId: viewerId, progress }, authors)
  // A club's circle is shared through the club's link, so new readers join the club and every book after.
  const club = buddyRead.clubId
    ? await prisma.club.findUnique({ where: { id: buddyRead.clubId }, select: { id: true, name: true, inviteCode: true, status: true } })
    : null

  return {
    buddyRead: {
      id: buddyRead.id,
      title: buddyRead.title,
      author: buddyRead.author,
      coverImage: buddyRead.coverImage,
      cardColour: buddyRead.cardColour,
      workKey: buddyRead.workKey,
      pages: buddyRead.pages,
      audioMinutes: buddyRead.audioMinutes,
      startsAt: buddyRead.startsAt.toISOString(),
      status: buddyRead.status,
      schedule: parseSchedule(buddyRead.schedule),
      hostId: buddyRead.hostId,
      // Members can share the link; anyone with it can join.
      inviteCode: buddyRead.inviteCode,
    },
    club: club && { id: club.id, name: club.name, inviteCode: club.status === "ACTIVE" ? club.inviteCode : null },
    viewer: { userId: viewerId, progress, isHost, canManage, canModerate, bookId: membership.member.bookId, muted: !!membership.member.mutedAt },
    members,
    comments,
  }
}
export type BuddyReadView = NonNullable<Awaited<ReturnType<typeof loadBuddyReadView>>>

// What the invite page and its OG image show: no comments, nothing behind the lock. Like a club's invite
// (lib/clubsServer.ts loadClubInvite), it names only members a stranger could see anyway (lib/clubs.ts
// inviteFaces), since anyone with the link sees it, signed out included; everyone is counted in memberCount.
export async function loadInvite(code: string, viewerId?: string | null) {
  if (!/^[a-z0-9]{6,20}$/.test(code)) return null
  const buddyRead = await prisma.buddyRead.findUnique({ where: { inviteCode: code } })
  if (!buddyRead || buddyRead.status === "ARCHIVED") return null
  const memberRows = await prisma.buddyReadMember.findMany({ where: { buddyReadId: buddyRead.id }, orderBy: { joinedAt: "asc" }, select: { userId: true } })
  const [users, blocked] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: memberRows.map((m) => m.userId) } }, select: { ...userSelect, ...staffBadgeSelect, ...suspensionSelect, profileVisibility: true } }),
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
  const strip = ({ profileVisibility: _v, suspended: _s, ...m }: (typeof everyone)[number]) => m
  const members = inviteFaces(everyone, { hostId: buddyRead.hostId, viewerId, blocked }).map(strip)
  // In a club's book the club's host is the one who invites, if they're reading it (lib/clubs.ts inviteHost).
  const club = buddyRead.clubId ? await prisma.club.findUnique({ where: { id: buddyRead.clubId }, select: { hostId: true } }) : null
  const hostRow = inviteHost(everyone, buddyRead.clubId ? club?.hostId ?? null : buddyRead.hostId, { viewerId, blocked })
  const host = hostRow ? strip(hostRow) : null
  return { buddyRead, host, members, memberCount: everyone.length }
}

// ---- Starting -----------------------------------------------------------------------------

// A new circle for a book on the host's shelf, with the host as its first member. POST /api/buddy-reads
// starts one on its own; a club starts its next book through here too (lib/clubsServer.ts), with clubId.
export async function createCircle(book: Book, hostId: string, opts: { startsAt?: string, schedule?: BuddyReadSchedule, clubId?: string }) {
  // A book with no page count can host too: its members log a percent (lib/progress.ts entersPercent),
  // and circles only ever compare percents.
  const scale = progressScale(book)
  const buddyRead = await prisma.buddyRead.create({
    data: {
      workKey: book.workKey,
      title: book.title,
      author: book.author,
      // Every member sees this cover, so it's never the host's own upload: the catalogue's instead.
      coverImage: await coverToShare(book.coverImage, book, null),
      cardColour: book.cardColour,
      pages: book.pages,
      audioMinutes: scale.unit === "MINUTES" ? book.audioMinutes : null,
      hostId,
      startsAt: opts.startsAt ? new Date(opts.startsAt) : new Date(),
      schedule: opts.schedule && opts.schedule.length > 0 ? opts.schedule : undefined,
      inviteCode: await newInviteCode(),
      ...(opts.clubId && { clubId: opts.clubId }),
    },
  })
  await prisma.buddyReadMember.create({
    data: { buddyReadId: buddyRead.id, userId: hostId, bookId: book.id, notifiedProgress: progressPercent(book) },
  })
  return buddyRead
}

// ---- Joining ------------------------------------------------------------------------------

// The member's own copy: the one already on their shelf (same Open Library work, or same title and
// author), or a new one in Currently reading using the host's page count, which they can change.
// `byClub`: a club's book (lib/clubs.ts CLUB_COPY_STATUS) goes in Want to read instead, and a copy already on
// the shelf is left as the reader has it.
export async function shelfBookFor(userId: string, buddyRead: BuddyRead, opts: { byClub?: boolean } = {}) {
  const shelf = await prisma.book.findMany({
    where: { userId },
    select: { id: true, title: true, author: true, workKey: true, status: true },
  })
  const existing = shelf.find((b) => sameBook(b, buddyRead))
  // Joining a circle overrides an earlier "will not read".
  if (existing?.status === "NOT_INTERESTED" && !opts.byClub) await prisma.book.update({ where: { id: existing.id }, data: { status: "NOT_STARTED" } })
  if (existing) return { bookId: existing.id, added: false }

  const now = new Date()
  // Filed under the same catalog Work as the host's copy (no Open Library call: the host's add made it).
  const catalog = await linkCatalog({ workKey: buddyRead.workKey, title: buddyRead.title, author: buddyRead.author, pages: buddyRead.pages, coverUrl: buddyRead.coverImage })
  const book = await prisma.book.create({
    data: {
      userId,
      title: buddyRead.title,
      author: buddyRead.author,
      // Never someone else's upload (a circle from before uploads stayed private): the catalogue's instead.
      coverImage: (await coverToShare(buddyRead.coverImage, { workId: catalog?.work.id, editionId: catalog?.edition.id, workKey: buddyRead.workKey }, userId)) ?? "",
      cardColour: buddyRead.cardColour,
      pages: buddyRead.pages,
      workKey: buddyRead.workKey,
      ...catalogIds(catalog),
      // The host's scale: a joiner of an audiobook circle starts on minutes too, and can change it.
      audioMinutes: buddyRead.audioMinutes,
      progressUnit: unitOf({ progressUnit: "MINUTES", audioMinutes: buddyRead.audioMinutes }),
      status: opts.byClub ? CLUB_COPY_STATUS : "STARTED",
      ...(!opts.byClub && { startedAt: now }),
      currentPage: 0,
      currentMinute: 0,
    },
  })
  if (opts.byClub) return { bookId: book.id, added: true }
  const firstRead = readFromBook(book)
  if (firstRead) await prisma.bookRead.create({ data: firstRead })
  await prisma.activity.create({ data: { userId, bookId: book.id, type: "STARTED_BOOK" } })
  return { bookId: book.id, added: true }
}

// A reader the host removed can't come back through the link (an invite from the host lifts it).
export const REMOVED_MESSAGE = "You were removed from this reading circle, so the invite link won't let you back in."
export async function wasRemoved(buddyReadId: string, userId: string) {
  return !!(await prisma.buddyReadRemoval.findUnique({ where: { buddyReadId_userId: { buddyReadId, userId } }, select: { id: true } }))
}

// A club's book is joined through the club (app/api/buddy-reads/join joins the club first while it's active),
// so its own link and invites never get round the club: someone removed from the club stays out, and once the
// club is archived only its members can still come in (say, back to a book they left).
export const CLUB_CLOSED_MESSAGE = "This club has closed, so its books can't take new readers."
export async function clubBookRefusal(clubId: string, userId: string): Promise<{ error: string, status: number } | null> {
  const [club, member, removal] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { status: true } }),
    prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId } }, select: { id: true } }),
    prisma.clubRemoval.findUnique({ where: { clubId_userId: { clubId, userId } }, select: { id: true } }),
  ])
  if (removal) return { error: "You were removed from this club, so the invite link won't let you back in.", status: 403 }
  if (!member && club?.status !== "ACTIVE") return { error: CLUB_CLOSED_MESSAGE, status: 410 }
  return null
}

export type JoinResult =
  | { ok: true, buddyReadId: string, alreadyMember: boolean, addedToShelf: boolean }
  | { ok: false, error: string, status: number }

export async function joinBuddyRead(buddyRead: BuddyRead, userId: string): Promise<JoinResult> {
  if (buddyRead.status === "ARCHIVED") return { ok: false, error: "This reading circle has ended.", status: 410 }

  const existing = await prisma.buddyReadMember.findUnique({ where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId } } })
  if (existing) {
    // Re-joining after removing the book from the shelf links a fresh copy.
    if (!(await isOwnBook(existing.bookId, userId))) {
      const { bookId, added } = await shelfBookFor(userId, buddyRead, { byClub: !!buddyRead.clubId })
      await prisma.buddyReadMember.update({ where: { id: existing.id }, data: { bookId } })
      return { ok: true, buddyReadId: buddyRead.id, alreadyMember: true, addedToShelf: added }
    }
    return { ok: true, buddyReadId: buddyRead.id, alreadyMember: true, addedToShelf: false }
  }

  if (await isBlockedEitherWay(userId, buddyRead.hostId)) return { ok: false, error: "You can't join this reading circle.", status: 403 }
  if (await wasRemoved(buddyRead.id, userId)) return { ok: false, error: REMOVED_MESSAGE, status: 403 }
  if (buddyRead.clubId) {
    const refusal = await clubBookRefusal(buddyRead.clubId, userId)
    if (refusal) return { ok: false, ...refusal }
  }
  const count = await prisma.buddyReadMember.count({ where: { buddyReadId: buddyRead.id } })
  if (count >= BUDDY_READ_MAX_MEMBERS) return { ok: false, error: `This reading circle is full (${BUDDY_READ_MAX_MEMBERS} readers).`, status: 409 }

  const { bookId, added } = await shelfBookFor(userId, buddyRead, { byClub: !!buddyRead.clubId })
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: progressBookSelect })
  try {
    await prisma.buddyReadMember.create({
      // Starting from their progress means a book already finished before joining never counts as a finished reading circle.
      data: { buddyReadId: buddyRead.id, userId, bookId, notifiedProgress: progressPercent(book) },
    })
  } catch (e) {
    // A double click: the other request already joined.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: true, buddyReadId: buddyRead.id, alreadyMember: true, addedToShelf: added }
    }
    throw e
  }
  await prisma.buddyReadInvite.deleteMany({ where: { buddyReadId: buddyRead.id, inviteeId: userId } })

  if (buddyRead.hostId !== userId) {
    await bumpNotification({ userId: buddyRead.hostId, actorId: userId, type: "BUDDY_READ_JOINED", buddyReadId: buddyRead.id, by: 1 })
    // The host's medal counts reading circles someone else joined.
    await awardNewAchievements(buddyRead.hostId, { trigger: "buddyRead" })
  }
  return { ok: true, buddyReadId: buddyRead.id, alreadyMember: false, addedToShelf: added }
}

// ---- Notifications ------------------------------------------------------------------------

// Reading circle notifications are batched: while the last one for this reading circle is unread, it's bumped
// ("ana and 2 others joined", "5 comments to read") instead of a new row per event. `push: false` writes a
// new row for the bell only.
export async function bumpNotification(n: { userId: string, actorId: string, type: NotificationType, buddyReadId: string, by: number, push?: boolean }) {
  const unread = await prisma.notification.findFirst({
    where: { userId: n.userId, read: false, type: n.type, buddyReadId: n.buddyReadId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (unread) {
    await prisma.notification.update({
      where: { id: unread.id },
      data: { count: { increment: n.by }, actorId: n.actorId, createdAt: new Date() },
    })
  } else {
    // Only a new row is pushed: while one is unread, more joins or unlocks just bump it, so a busy circle
    // doesn't buzz the phone with every one.
    const data = { userId: n.userId, actorId: n.actorId, type: n.type, buddyReadId: n.buddyReadId, count: n.by }
    if (n.push === false) await prisma.notification.create({ data })
    else await createNotification(data)
  }
}

// Called by /api/book-progress after a reader's page or status changes. For each reading circle the book
// is in: records a first finish (for the medal), and if the reader moved past other members' comments,
// adds them to one batched "N comments to read" notification (not while they've muted the circle). Cheap
// when the book isn't in one.
export async function onBuddyReadProgress(userId: string, book: ProgressBook) {
  const memberships = await prisma.buddyReadMember.findMany({ where: { bookId: book.id, userId } })
  if (memberships.length === 0) return
  const progress = progressPercent(book)

  for (const m of memberships) {
    // Finishing means reaching 100% while a member, not joining with the book already done.
    const finished = progress >= 100 && !m.finishedAt && m.notifiedProgress < 100
    if (progress <= m.notifiedProgress && !finished) continue
    // Conditional on the old value, so two quick updates can't both notify for the same stretch.
    const claimed = await prisma.buddyReadMember.updateMany({
      where: { id: m.id, notifiedProgress: m.notifiedProgress },
      data: {
        notifiedProgress: Math.max(progress, m.notifiedProgress),
        ...(finished && { finishedAt: new Date() }),
      },
    })
    // Muted: the claim above still moves on, so unmuting doesn't bring back a backlog.
    if (claimed.count === 0 || progress <= m.notifiedProgress || m.mutedAt) continue

    const unlocked = await prisma.buddyReadComment.findMany({
      // MongoDB: `deletedAt: null` alone misses comments that never had the field set, which is all of them.
      where: {
        buddyReadId: m.buddyReadId,
        userId: { not: userId },
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        position: { gt: m.notifiedProgress, lte: progress },
      },
      orderBy: { createdAt: "desc" },
      select: { userId: true, position: true },
    })
    const fromVisible: string[] = []
    for (const c of unlocked) {
      if (unlockedByProgress(c.position, m.notifiedProgress, progress) && !(await isBlockedEitherWay(userId, c.userId))) fromVisible.push(c.userId)
    }
    if (fromVisible.length === 0) continue
    await bumpNotification({ userId, actorId: fromVisible[0], type: "COMMENTS_UNLOCKED", buddyReadId: m.buddyReadId, by: fromVisible.length })
  }
}

// A comment was just posted. Members already at or past it hear now (newCommentRecipients); the rest hear
// when their progress passes it (onBuddyReadProgress), so nobody is told twice or before they can read it.
// Someone with the circle open gets the bell row without a push. Never fails the post.
export const CIRCLE_OPEN_MS = 5 * 60 * 1000
export async function notifyNewComment(buddyReadId: string, comment: { userId: string, position: number }) {
  try {
    const members = await prisma.buddyReadMember.findMany({
      where: { buddyReadId, userId: { not: comment.userId } },
      select: { userId: true, notifiedProgress: true, mutedAt: true, lastSeenAt: true },
    })
    if (members.length === 0) return
    const blocked = await blockedAmong(comment.userId, members.map((m) => m.userId))
    const recipients = new Set(newCommentRecipients(comment, members, blocked))
    const openSince = Date.now() - CIRCLE_OPEN_MS
    for (const m of members) {
      if (!recipients.has(m.userId)) continue
      const open = !!m.lastSeenAt && m.lastSeenAt.getTime() > openSince
      await bumpNotification({ userId: m.userId, actorId: comment.userId, type: "COMMENTS_UNLOCKED", buddyReadId, by: 1, push: !open })
    }
  } catch (e) {
    console.error("Couldn't notify the circle about a new comment", e)
  }
}

// The reader has the circle open: what it had for them is read now, so the next comment buzzes again.
// lastSeenAt is written at most once a minute, as the app polls every few seconds.
export async function markCircleSeen(buddyReadId: string, userId: string) {
  try {
    const now = new Date()
    await prisma.buddyReadMember.updateMany({
      // MongoDB: `lastSeenAt: null` alone misses memberships that never had the field set.
      where: { buddyReadId, userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { isSet: false } }, { lastSeenAt: { lt: new Date(now.getTime() - 60 * 1000) } }] },
      data: { lastSeenAt: now },
    })
    await prisma.notification.updateMany({ where: { userId, buddyReadId, read: false, type: "COMMENTS_UNLOCKED" }, data: { read: true } })
  } catch (e) {
    console.error("Couldn't mark the reading circle as seen", e)
  }
}

// ---- Handing over hosting ------------------------------------------------------------------

// Account deletion runs these inside its transaction (lib/accountDeletion.ts); everything else uses prisma.
type Db = Prisma.TransactionClient

// The circle passes to `toUserId`. It's marked inherited, so it counts against their inherited cap rather
// than the two circles they may start, and they're told about it. `from` is the host who chose them, or
// null when the host closed their account (then the notification can't name them).
export async function handOverHosting(buddyRead: BuddyRead, toUserId: string, opts: { from: string | null, archive?: boolean }, db: Db = prisma) {
  await db.buddyRead.update({
    where: { id: buddyRead.id },
    data: { hostId: toUserId, inheritedAt: new Date(), ...(opts.archive && { status: "ARCHIVED" }) },
  })
  const data = opts.from
    ? { userId: toUserId, actorId: opts.from, type: "BUDDY_READ_HOSTED" as const, buddyReadId: buddyRead.id, count: 1 }
    : { userId: toUserId, actorId: toUserId, type: "BUDDY_READ_HOST_INHERITED" as const, buddyReadId: buddyRead.id, count: 1 }
  await db.notification.create({ data })
  // A host handing over is pushed. A handover inside account deletion (no `from`) runs in its transaction,
  // which could still roll back, so it stays in the bell.
  if (opts.from) await sendPushes([data])
}

// Who takes over when the host closes their account: the longest-standing member with room for another
// inherited circle. Room only matters for an active circle. If nobody has room, the longest-standing
// member gets it archived, and can reopen it once they have room (or Plus). Null when nobody else is in it.
export async function successorFor(buddyRead: BuddyRead, leavingUserId: string, db: Db = prisma): Promise<{ userId: string, archive: boolean } | null> {
  const memberRows = await db.buddyReadMember.findMany({
    where: { buddyReadId: buddyRead.id, userId: { not: leavingUserId } },
    orderBy: { joinedAt: "asc" },
    select: { userId: true },
  })
  // Memberships can outlive an account closed before deletion cleaned them up.
  const existing = new Set((await db.user.findMany({ where: { id: { in: memberRows.map((m) => m.userId) } }, select: { id: true } })).map((u) => u.id))
  const candidates = memberRows.map((m) => m.userId).filter((id) => existing.has(id))
  if (candidates.length === 0) return null
  if (buddyRead.status !== "ACTIVE") return { userId: candidates[0], archive: false }
  for (const userId of candidates) {
    if ((await canInheritAnotherCircle(userId)).allowed) return { userId, archive: false }
  }
  return { userId: candidates[0], archive: true }
}

// ---- Account deletion ---------------------------------------------------------------------

// Reading circle rows reference users by id (no relation), so account deletion calls this (pass its
// transaction as `db`). Circles they host pass to the next member, or end if nobody else is in them.
// Their comments stay, shown as a former member's, so the conversation around them still reads; their
// reactions, reports, invites, memberships and removals go.
export async function deleteBuddyReadDataFor(userId: string, db: Db = prisma) {
  const hosted = await db.buddyRead.findMany({ where: { hostId: userId } })
  const ended: string[] = []
  for (const buddyRead of hosted) {
    const next = await successorFor(buddyRead, userId, db)
    if (next) await handOverHosting(buddyRead, next.userId, { from: null, archive: next.archive }, db)
    else ended.push(buddyRead.id)
  }

  if (ended.length > 0) {
    await db.buddyReadReaction.deleteMany({ where: { comment: { buddyReadId: { in: ended } } } })
    await db.buddyReadCommentReport.deleteMany({ where: { comment: { buddyReadId: { in: ended } } } })
    await db.buddyReadComment.updateMany({ where: { buddyReadId: { in: ended } }, data: { parentId: null } })
    await db.buddyReadComment.deleteMany({ where: { buddyReadId: { in: ended } } })
    await db.buddyReadMember.deleteMany({ where: { buddyReadId: { in: ended } } })
    await db.buddyReadInvite.deleteMany({ where: { buddyReadId: { in: ended } } })
    await db.buddyReadRemoval.deleteMany({ where: { buddyReadId: { in: ended } } })
    await db.notification.deleteMany({ where: { buddyReadId: { in: ended } } })
    await db.buddyRead.deleteMany({ where: { id: { in: ended } } })
  }

  await db.buddyReadReaction.deleteMany({ where: { userId } })
  await db.buddyReadCommentReport.deleteMany({ where: { reporterId: userId } })
  await db.buddyReadMember.deleteMany({ where: { userId } })
  await db.buddyReadInvite.deleteMany({ where: { OR: [{ inviteeId: userId }, { inviterId: userId }] } })
  await db.buddyReadRemoval.deleteMany({ where: { userId } })
}
