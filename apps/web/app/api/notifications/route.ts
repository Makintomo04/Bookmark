import { booksReadCount } from "@/lib/readerTier";
import { requireUser } from "@/lib/apiAuth";
import prisma from "@/lib/db";
import { sameBook } from "@/lib/workKey";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  // Quests were cut before launch; any old quest-medal notifications are left out.
  const shown = { userId: currentUser.id, type: { not: "QUEST_COMPLETED" as const } }
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: shown,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        actor: { select: { username: true, image: true, favColour: true, ...booksReadCount } },
      },
    }),
    prisma.notification.count({ where: { ...shown, read: false } }),
  ])

  // Reading circle notifications name the book. buddyReadId is a plain id, so look the titles up in one go.
  const buddyReadIds = Array.from(new Set(notifications.flatMap((n) => (n.buddyReadId ? [n.buddyReadId] : []))))
  const buddyReads = buddyReadIds.length > 0
    ? await prisma.buddyRead.findMany({ where: { id: { in: buddyReadIds } }, select: { id: true, title: true, inviteCode: true, status: true } })
    : []
  const buddyReadById = new Map(buddyReads.map((b) => [b.id, b]))
  const withBuddyReads = notifications.map((n) => (n.buddyReadId ? { ...n, buddyRead: buddyReadById.get(n.buddyReadId) ?? null } : n))

  // Recommendations name the sender's copy of the book, and say whether it's already on the reader's shelf.
  const recommendedIds = Array.from(new Set(notifications.flatMap((n) => (n.type === "BOOK_RECOMMENDED" && n.bookId ? [n.bookId] : []))))
  const recommended = recommendedIds.length > 0
    ? await prisma.book.findMany({ where: { id: { in: recommendedIds } }, select: { id: true, title: true, author: true, coverImage: true, workKey: true } })
    : []
  const mine = recommended.length > 0
    ? await prisma.book.findMany({
        where: { userId: currentUser.id, status: { not: "NOT_INTERESTED" }, OR: [{ workKey: { in: recommended.flatMap((b) => (b.workKey ? [b.workKey] : [])) } }, { title: { in: recommended.map((b) => b.title) } }] },
        select: { title: true, author: true, workKey: true },
      })
    : []
  const recommendedById = new Map(recommended.map(({ workKey, ...b }) => [b.id, { ...b, onShelf: mine.some((m) => sameBook(m, { ...b, workKey })) }]))
  const withRecommendations = withBuddyReads.map((n) => (n.type === "BOOK_RECOMMENDED" ? { ...n, book: n.bookId ? recommendedById.get(n.bookId) ?? null : null } : n))

  return NextResponse.json({ notifications: withRecommendations, unreadCount })
}

export async function PATCH(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const body = await req.json()
  const { id, all } = body

  if (all) {
    await prisma.notification.updateMany({
      where: { userId: currentUser.id, read: false },
      data: { read: true },
    })
    return NextResponse.json({ success: true })
  }

  if (!id) {
    return NextResponse.json({ error: 'id or all is required' }, { status: 400 })
  }

  const notification = await prisma.notification.findUnique({ where: { id } })
  if (!notification || notification.userId !== currentUser.id) {
    return NextResponse.json({ error: 'Notification Not Found' }, { status: 404 })
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { read: true },
  })
  return NextResponse.json(updated)
}
