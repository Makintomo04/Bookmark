import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/apiAuth";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rateLimit";
import { createBuddyReadSchema, progressPercent } from "@/lib/buddyReads";
import { buddyReadError, canHostAnotherCircle, isBlockedEitherWay, isObjectId, newInviteCode, parseBody } from "@/lib/buddyReadsServer";
import { progressSelect, progressScale } from "@/lib/progress";

// The reader's buddy reads (newest first) with everyone's progress, and invites waiting for them.
// ?bookId= narrows it to the buddy reads that shelf book is in (the book modal's entry point).
export async function GET(req: Request) {
  const { user: currentUser, response } = await requireUser();
  if (response) return response;

  const bookId = new URL(req.url).searchParams.get("bookId");
  if (bookId !== null && !isObjectId(bookId)) return NextResponse.json({ buddyReads: [], invites: [] });
  const mine = await prisma.buddyReadMember.findMany({
    where: { userId: currentUser.id, ...(bookId && { bookId }) },
    orderBy: { joinedAt: "desc" },
    take: 100,
    include: { buddyRead: true },
  });
  const buddyReadIds = mine.map((m) => m.buddyReadId);

  const [allMembers, invites] = await Promise.all([
    prisma.buddyReadMember.findMany({ where: { buddyReadId: { in: buddyReadIds } }, orderBy: { joinedAt: "asc" } }),
    bookId ? Promise.resolve([]) : prisma.buddyReadInvite.findMany({
      where: { inviteeId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { buddyRead: true },
    }),
  ]);
  const userIds = Array.from(new Set([...allMembers.map((m) => m.userId), ...invites.map((i) => i.inviterId)]));
  const [users, books] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, image: true, favColour: true } }),
    prisma.book.findMany({ where: { id: { in: allMembers.map((m) => m.bookId) } }, select: { id: true, userId: true, ...progressSelect } }),
  ]);
  // Whether they may start another: the list page and the new-circle form say so before the server has to.
  const hosting = bookId ? null : await canHostAnotherCircle(currentUser.id);
  const userById = new Map(users.map((u) => [u.id, u]));
  const bookById = new Map(books.map((b) => [b.id, b]));

  const blocked = new Set<string>();
  for (const id of userIds) if (id !== currentUser.id && (await isBlockedEitherWay(currentUser.id, id))) blocked.add(id);

  const buddyReads = mine.map(({ buddyRead }) => {
    const members = allMembers
      .filter((m) => m.buddyReadId === buddyRead.id && userById.has(m.userId) && !blocked.has(m.userId))
      .map((m) => {
        const u = userById.get(m.userId)!;
        const book = bookById.get(m.bookId);
        return { userId: u.id, username: u.username, image: u.image, favColour: u.favColour, progress: book?.userId === u.id ? progressPercent(book) : 0 };
      });
    return {
      id: buddyRead.id,
      title: buddyRead.title,
      author: buddyRead.author,
      coverImage: buddyRead.coverImage,
      cardColour: buddyRead.cardColour,
      status: buddyRead.status,
      startsAt: buddyRead.startsAt.toISOString(),
      isHost: buddyRead.hostId === currentUser.id,
      myProgress: members.find((m) => m.userId === currentUser.id)?.progress ?? 0,
      members,
    };
  });

  return NextResponse.json({
    buddyReads,
    hosting,
    invites: invites
      .filter((i) => i.buddyRead.status !== "ARCHIVED" && userById.has(i.inviterId) && !blocked.has(i.inviterId))
      .map((i) => ({
        id: i.id,
        createdAt: i.createdAt.toISOString(),
        inviter: { username: userById.get(i.inviterId)!.username, image: userById.get(i.inviterId)!.image, favColour: userById.get(i.inviterId)!.favColour },
        buddyRead: { id: i.buddyRead.id, title: i.buddyRead.title, author: i.buddyRead.author, coverImage: i.buddyRead.coverImage, cardColour: i.buddyRead.cardColour, inviteCode: i.buddyRead.inviteCode },
      })),
  });
}

// Starts a buddy read of a book on the host's shelf. The host is its first member.
export async function POST(req: Request) {
  const { user: currentUser, response } = await requireUser("Sign in to start a circle.");
  if (response) return response;

  const parsed = await parseBody(req, createBuddyReadSchema);
  if (parsed.response) return parsed.response;
  const { bookId, startsAt, schedule } = parsed.data;

  const limit = rateLimit(`buddy-read-create:${currentUser.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return buddyReadError(tooManyRequestsMessage, 429);

  const book = isObjectId(bookId) ? await prisma.book.findUnique({ where: { id: bookId } }) : null;
  if (!book || book.userId !== currentUser.id) return buddyReadError("Book not found", 404);
  const scale = progressScale(book);
  if (!(scale.total > 0)) {
    return buddyReadError(scale.unit === "MINUTES"
      ? "Add the audiobook's running time first, so everyone's progress can be tracked."
      : "Add the book's page count first, so everyone's progress can be tracked.", 400);
  }

  // Free accounts host one active circle at a time. Joining is never limited.
  const hosting = await canHostAnotherCircle(currentUser.id);
  if (!hosting.allowed) return buddyReadError(hosting.message ?? "You can't host another circle right now.", 403);

  const buddyRead = await prisma.buddyRead.create({
    data: {
      workKey: book.workKey,
      title: book.title,
      author: book.author,
      coverImage: book.coverImage || null,
      cardColour: book.cardColour,
      pages: book.pages,
      audioMinutes: scale.unit === "MINUTES" ? book.audioMinutes : null,
      hostId: currentUser.id,
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      schedule: schedule && schedule.length > 0 ? schedule : undefined,
      inviteCode: await newInviteCode(),
    },
  });
  await prisma.buddyReadMember.create({
    data: { buddyReadId: buddyRead.id, userId: currentUser.id, bookId: book.id, notifiedProgress: progressPercent(book) },
  });
  return NextResponse.json({ id: buddyRead.id, inviteCode: buddyRead.inviteCode });
}
