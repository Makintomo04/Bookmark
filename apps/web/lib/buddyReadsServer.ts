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
import { sameBook } from "@/lib/workKey";
import {
  BUDDY_READ_MAX_MEMBERS,
  circleProgress,
  hostingAllowance,
  inheritedAllowance,
  makeInviteCode,
  progressPercent,
  scheduleSchema,
  serializeComments,
  type BuddyReadSchedule,
  type CommentAuthors,
  type HostingAllowance,
  type HostingPlan,
} from "@/lib/buddyReads";
import { progressSelect, unitOf } from "@/lib/progress";
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

const userSelect = { id: true, username: true, image: true, favColour: true, ...booksReadCount } as const

type ProgressBook = Pick<Book, "id" | "status" | "currentPage" | "pages" | "progressUnit" | "currentMinute" | "audioMinutes">
const progressBookSelect = { id: true, ...progressSelect } as const

// ---- Hosting ------------------------------------------------------------------------------

// MongoDB: `inheritedAt: null` alone misses circles that never had the field set, which is most of them.
const startedByHost = { OR: [{ inheritedAt: null }, { inheritedAt: { isSet: false } }] } satisfies Prisma.BuddyReadWhereInput
const inheritedByHost = { inheritedAt: { not: null } } satisfies Prisma.BuddyReadWhereInput

async function hostingPlanOf(userId: string): Promise<HostingPlan> {
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
  return { member, buddyRead: member.buddyRead, progress, isHost: member.buddyRead.hostId === userId }
}

async function isOwnBook(bookId: string, userId: string) {
  return !!(await prisma.book.findFirst({ where: { id: bookId, userId }, select: { id: true } }))
}

// Members, progress and the spoiler-locked discussion, as this viewer may see it.
export async function loadBuddyReadView(buddyReadId: string, viewerId: string) {
  const membership = await findMembership(buddyReadId, viewerId)
  if (!membership) return null
  const { buddyRead, progress, isHost } = membership

  const memberRows = await prisma.buddyReadMember.findMany({ where: { buddyReadId }, orderBy: { joinedAt: "asc" } })
  const [users, books] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: memberRows.map((m) => m.userId) } }, select: userSelect }),
    prisma.book.findMany({ where: { id: { in: memberRows.map((m) => m.bookId) } }, select: { ...progressBookSelect, userId: true } }),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const bookById = new Map(books.map((b) => [b.id, b]))

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
      ? prisma.user.findMany({ where: { id: { in: pastWriterIds } }, select: { id: true, username: true, image: true, favColour: true } })
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
      image: user.image,
      favColour: user.favColour,
      booksRead: booksReadOf(user),
      progress: circleProgress(book && book.userId === m.userId ? progressPercent(book) : 0, m.notifiedProgress),
      isHost: m.userId === buddyRead.hostId,
      isYou: m.userId === viewerId,
      joinedAt: m.joinedAt.toISOString(),
      finishedAt: m.finishedAt?.toISOString() ?? null,
    }]
  })

  const authors: CommentAuthors = new Map(members.map((m) => [m.userId, { username: m.username, image: m.image, favColour: m.favColour }]))
  const pastWriterById = new Map(pastWriters.map((u) => [u.id, u]))
  for (const id of pastWriterIds) {
    if (blocked.has(id)) continue
    const u = pastWriterById.get(id)
    authors.set(id, u ? { username: u.username, image: u.image, favColour: u.favColour } : null)
  }
  // The lock runs here, on the server: bodies past the viewer's progress never leave this function.
  const comments = serializeComments(rows, { userId: viewerId, progress }, authors)

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
    viewer: { userId: viewerId, progress, isHost, bookId: membership.member.bookId },
    members,
    comments,
  }
}
export type BuddyReadView = NonNullable<Awaited<ReturnType<typeof loadBuddyReadView>>>

// What the invite page and its OG image show: no comments, nothing behind the lock.
export async function loadInvite(code: string) {
  if (!/^[a-z0-9]{6,20}$/.test(code)) return null
  const buddyRead = await prisma.buddyRead.findUnique({ where: { inviteCode: code } })
  if (!buddyRead || buddyRead.status === "ARCHIVED") return null
  const memberRows = await prisma.buddyReadMember.findMany({ where: { buddyReadId: buddyRead.id }, orderBy: { joinedAt: "asc" }, select: { userId: true } })
  const users = await prisma.user.findMany({ where: { id: { in: memberRows.map((m) => m.userId) } }, select: userSelect })
  const userById = new Map(users.map((u) => [u.id, u]))
  const members = memberRows.flatMap((m) => {
    const u = userById.get(m.userId)
    return u ? [{ userId: u.id, username: u.username, image: u.image, favColour: u.favColour, booksRead: booksReadOf(u) }] : []
  })
  const host = members.find((m) => m.userId === buddyRead.hostId) ?? null
  return { buddyRead, host, members }
}

// ---- Joining ------------------------------------------------------------------------------

// The member's own copy: the one already on their shelf (same Open Library work, or same title and
// author), or a new one in Currently reading using the host's page count, which they can change.
export async function shelfBookFor(userId: string, buddyRead: BuddyRead) {
  const shelf = await prisma.book.findMany({
    where: { userId },
    select: { id: true, title: true, author: true, workKey: true, status: true },
  })
  const existing = shelf.find((b) => sameBook(b, buddyRead))
  // Joining a circle overrides an earlier "will not read".
  if (existing?.status === "NOT_INTERESTED") await prisma.book.update({ where: { id: existing.id }, data: { status: "NOT_STARTED" } })
  if (existing) return { bookId: existing.id, added: false }

  const now = new Date()
  // Filed under the same catalog Work as the host's copy (no Open Library call: the host's add made it).
  const catalog = await linkCatalog({ workKey: buddyRead.workKey, title: buddyRead.title, author: buddyRead.author, pages: buddyRead.pages, coverUrl: buddyRead.coverImage })
  const book = await prisma.book.create({
    data: {
      userId,
      title: buddyRead.title,
      author: buddyRead.author,
      coverImage: buddyRead.coverImage ?? "",
      cardColour: buddyRead.cardColour,
      pages: buddyRead.pages,
      workKey: buddyRead.workKey,
      ...catalogIds(catalog),
      // The host's scale: a joiner of an audiobook circle starts on minutes too, and can change it.
      audioMinutes: buddyRead.audioMinutes,
      progressUnit: unitOf({ progressUnit: "MINUTES", audioMinutes: buddyRead.audioMinutes }),
      status: "STARTED",
      startedAt: now,
      currentPage: 0,
      currentMinute: 0,
    },
  })
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

export type JoinResult =
  | { ok: true, buddyReadId: string, alreadyMember: boolean, addedToShelf: boolean }
  | { ok: false, error: string, status: number }

export async function joinBuddyRead(buddyRead: BuddyRead, userId: string): Promise<JoinResult> {
  if (buddyRead.status === "ARCHIVED") return { ok: false, error: "This reading circle has ended.", status: 410 }

  const existing = await prisma.buddyReadMember.findUnique({ where: { buddyReadId_userId: { buddyReadId: buddyRead.id, userId } } })
  if (existing) {
    // Re-joining after removing the book from the shelf links a fresh copy.
    if (!(await isOwnBook(existing.bookId, userId))) {
      const { bookId, added } = await shelfBookFor(userId, buddyRead)
      await prisma.buddyReadMember.update({ where: { id: existing.id }, data: { bookId } })
      return { ok: true, buddyReadId: buddyRead.id, alreadyMember: true, addedToShelf: added }
    }
    return { ok: true, buddyReadId: buddyRead.id, alreadyMember: true, addedToShelf: false }
  }

  if (await isBlockedEitherWay(userId, buddyRead.hostId)) return { ok: false, error: "You can't join this reading circle.", status: 403 }
  if (await wasRemoved(buddyRead.id, userId)) return { ok: false, error: REMOVED_MESSAGE, status: 403 }
  const count = await prisma.buddyReadMember.count({ where: { buddyReadId: buddyRead.id } })
  if (count >= BUDDY_READ_MAX_MEMBERS) return { ok: false, error: `This reading circle is full (${BUDDY_READ_MAX_MEMBERS} readers).`, status: 409 }

  const { bookId, added } = await shelfBookFor(userId, buddyRead)
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
// ("ana and 2 others joined", "5 comments unlocked") instead of a new row per event.
export async function bumpNotification(n: { userId: string, actorId: string, type: NotificationType, buddyReadId: string, by: number }) {
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
    await createNotification({ userId: n.userId, actorId: n.actorId, type: n.type, buddyReadId: n.buddyReadId, count: n.by })
  }
}

// Called by /api/book-progress after a reader's page or status changes. For each reading circle the book
// is in: records a first finish (for the medal), and if the reader moved past other members' comments,
// adds them to one batched "N comments unlocked" notification. Cheap when the book isn't in one.
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
    if (claimed.count === 0 || progress <= m.notifiedProgress) continue

    const unlocked = await prisma.buddyReadComment.findMany({
      // MongoDB: `deletedAt: null` alone misses comments that never had the field set, which is all of them.
      where: {
        buddyReadId: m.buddyReadId,
        userId: { not: userId },
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        position: { gt: m.notifiedProgress, lte: progress },
      },
      orderBy: { createdAt: "desc" },
      select: { userId: true },
    })
    const fromVisible: string[] = []
    for (const c of unlocked) if (!(await isBlockedEitherWay(userId, c.userId))) fromVisible.push(c.userId)
    if (fromVisible.length === 0) continue
    await bumpNotification({ userId, actorId: fromVisible[0], type: "COMMENTS_UNLOCKED", buddyReadId: m.buddyReadId, by: fromVisible.length })
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
