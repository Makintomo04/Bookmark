// Buddy reads: database work for the API routes and pages. The rules and the spoiler lock itself
// live in lib/buddyReads.ts (pure, so they can be checked without a database).
import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { Prisma, type Book, type BuddyRead, type NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { awardNewAchievements } from "@/lib/achievements";
import { readFromBook } from "@/lib/readHistory";
import { booksReadCount, booksReadOf } from "@/lib/readerTier";
import { sameBook } from "@/lib/workKey";
import {
  BUDDY_READ_MAX_MEMBERS,
  makeInviteCode,
  progressPercent,
  scheduleSchema,
  serializeComments,
  type BuddyReadSchedule,
  type CommentAuthor,
} from "@/lib/buddyReads";

export const isObjectId = (id: string | null | undefined): id is string => !!id && /^[a-f0-9]{24}$/i.test(id)

// Blocked users can't join each other's buddy reads, invite each other, or see each other's progress
// and comments. Every buddy-read path that pairs two readers goes through here.
export async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return false
  const block = await prisma.block.findFirst({
    where: { OR: [{ blockerId: userA, blockedId: userB }, { blockerId: userB, blockedId: userA }] },
    select: { id: true },
  })
  return !!block
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
  if (!membership) return { membership: null, response: buddyReadError("Buddy read not found", 404) } as const
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

type ProgressBook = Pick<Book, "id" | "status" | "currentPage" | "pages">
const progressBookSelect = { id: true, status: true, currentPage: true, pages: true } as const

// A buddy read and the viewer's membership, or null if they aren't in it. Not found and not a member
// look the same from outside, so ids can't be probed.
export async function findMembership(buddyReadId: string, userId: string) {
  if (!isObjectId(buddyReadId)) return null
  const member = await prisma.buddyReadMember.findUnique({
    where: { buddyReadId_userId: { buddyReadId, userId } },
    include: { buddyRead: true },
  })
  if (!member) return null
  const book = await prisma.book.findUnique({ where: { id: member.bookId }, select: { ...progressBookSelect, userId: true } })
  // A book removed from the shelf counts as not started, so nothing past 0% unlocks.
  const progress = book && book.userId === userId ? progressPercent(book) : 0
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

  const blocked = new Set<string>()
  for (const m of memberRows) {
    if (m.userId !== viewerId && (await isBlockedEitherWay(viewerId, m.userId))) blocked.add(m.userId)
  }

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
      progress: book && book.userId === m.userId ? progressPercent(book) : 0,
      isHost: m.userId === buddyRead.hostId,
      isYou: m.userId === viewerId,
      joinedAt: m.joinedAt.toISOString(),
      finishedAt: m.finishedAt?.toISOString() ?? null,
    }]
  })

  const authors = new Map<string, CommentAuthor>(members.map((m) => [m.userId, { username: m.username, image: m.image, favColour: m.favColour }]))
  const rows = await prisma.buddyReadComment.findMany({
    where: { buddyReadId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: 2000,
    include: { reactions: { select: { userId: true, emoji: true } } },
  })
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
  if (existing) return { bookId: existing.id, added: false }

  const now = new Date()
  const book = await prisma.book.create({
    data: {
      userId,
      title: buddyRead.title,
      author: buddyRead.author,
      coverImage: buddyRead.coverImage ?? "",
      cardColour: buddyRead.cardColour,
      pages: buddyRead.pages,
      workKey: buddyRead.workKey,
      status: "STARTED",
      startedAt: now,
      currentPage: 0,
    },
  })
  const firstRead = readFromBook(book)
  if (firstRead) await prisma.bookRead.create({ data: firstRead })
  await prisma.activity.create({ data: { userId, bookId: book.id, type: "STARTED_BOOK" } })
  return { bookId: book.id, added: true }
}

export type JoinResult =
  | { ok: true, buddyReadId: string, alreadyMember: boolean, addedToShelf: boolean }
  | { ok: false, error: string, status: number }

export async function joinBuddyRead(buddyRead: BuddyRead, userId: string): Promise<JoinResult> {
  if (buddyRead.status === "ARCHIVED") return { ok: false, error: "This buddy read has ended.", status: 410 }

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

  if (await isBlockedEitherWay(userId, buddyRead.hostId)) return { ok: false, error: "You can't join this buddy read.", status: 403 }
  const count = await prisma.buddyReadMember.count({ where: { buddyReadId: buddyRead.id } })
  if (count >= BUDDY_READ_MAX_MEMBERS) return { ok: false, error: `This buddy read is full (${BUDDY_READ_MAX_MEMBERS} readers).`, status: 409 }

  const { bookId, added } = await shelfBookFor(userId, buddyRead)
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: progressBookSelect })
  try {
    await prisma.buddyReadMember.create({
      // Starting from their progress means a book already finished before joining never counts as a finished buddy read.
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
    // The host's medal counts buddy reads someone else joined.
    await awardNewAchievements(buddyRead.hostId, { trigger: "buddyRead" })
  }
  return { ok: true, buddyReadId: buddyRead.id, alreadyMember: false, addedToShelf: added }
}

// ---- Notifications ------------------------------------------------------------------------

// Buddy-read notifications are batched: while the last one for this buddy read is unread, it's bumped
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
    await prisma.notification.create({
      data: { userId: n.userId, actorId: n.actorId, type: n.type, buddyReadId: n.buddyReadId, count: n.by },
    })
  }
}

// Called by /api/book-progress after a reader's page or status changes. For each buddy read the book
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

// ---- Account deletion ---------------------------------------------------------------------

// Buddy-read rows reference users by id (no relation), so account deletion should call this.
export async function deleteBuddyReadDataFor(userId: string) {
  const hosted = await prisma.buddyRead.findMany({ where: { hostId: userId }, select: { id: true } })
  const hostedIds = hosted.map((b) => b.id)
  await prisma.buddyReadReaction.deleteMany({ where: { OR: [{ userId }, { comment: { buddyReadId: { in: hostedIds } } }] } })
  await prisma.buddyReadCommentReport.deleteMany({ where: { OR: [{ reporterId: userId }, { comment: { buddyReadId: { in: hostedIds } } }] } })
  // Their comments elsewhere stay as deleted placeholders so other readers' replies keep their place.
  await prisma.buddyReadComment.updateMany({ where: { userId, buddyReadId: { notIn: hostedIds } }, data: { body: "", deletedAt: new Date() } })
  await prisma.buddyReadComment.updateMany({ where: { buddyReadId: { in: hostedIds } }, data: { parentId: null } })
  await prisma.buddyReadComment.deleteMany({ where: { buddyReadId: { in: hostedIds } } })
  await prisma.buddyReadMember.deleteMany({ where: { OR: [{ userId }, { buddyReadId: { in: hostedIds } }] } })
  await prisma.buddyReadInvite.deleteMany({ where: { OR: [{ inviteeId: userId }, { inviterId: userId }, { buddyReadId: { in: hostedIds } }] } })
  await prisma.buddyRead.deleteMany({ where: { id: { in: hostedIds } } })
}
