import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.error();
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        actor: { select: { username: true, image: true, favColour: true } },
      },
    }),
    prisma.notification.count({ where: { userId: currentUser.id, read: false } }),
  ])

  return NextResponse.json({ notifications, unreadCount })
}

export async function PATCH(req: Request) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.error();
  }

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
