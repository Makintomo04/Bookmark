import prisma from "@/lib/db";
import { catalogIds, linkCatalog } from "@/lib/catalog";
import { isBlockedEitherWay } from "@/lib/buddyReadsServer";
import { sameBook } from "@/lib/workKey";
import type { RecommendFriend } from "@/lib/recommendRules";

export { RECOMMEND_MAX_FRIENDS, RECOMMEND_MESSAGE_MAX, type RecommendFriend } from "@/lib/recommendRules";

// Friends are people you follow who follow you back. Only they can be sent a book, so a recommendation
// is never a cold message from a stranger.
export async function mutualFollowIds(userId: string): Promise<string[]> {
  const following = await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
  if (following.length === 0) return [];
  const back = await prisma.follow.findMany({
    where: { followerId: { in: following.map((f) => f.followingId) }, followingId: userId },
    select: { followerId: true },
  });
  const ids = back.map((f) => f.followerId);
  if (ids.length === 0) return [];
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId, blockedId: { in: ids } }, { blockedId: userId, blockerId: { in: ids } }] },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
  return ids.filter((id) => !blocked.has(id));
}

export async function recommendFriends(userId: string, book: { title: string; author: string; workKey: string | null }): Promise<RecommendFriend[]> {
  const ids = await mutualFollowIds(userId);
  if (ids.length === 0) return [];
  const [users, shelved] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, image: true, favColour: true } }),
    prisma.book.findMany({
      where: { userId: { in: ids }, OR: [...(book.workKey ? [{ workKey: book.workKey }] : []), { title: { equals: book.title, mode: "insensitive" as const } }] },
      select: { userId: true, title: true, author: true, workKey: true },
    }),
  ]);
  const owners = new Set(shelved.filter((b) => sameBook(b, book)).map((b) => b.userId));
  return users
    .filter((u) => u.username)
    .map((u) => ({ username: u.username!, image: u.image, favColour: u.favColour, hasBook: owners.has(u.id) }))
    .sort((a, b) => Number(a.hasBook) - Number(b.hasBook) || a.username.localeCompare(b.username));
}

export type AcceptResult = { ok: true; bookId: string; added: boolean } | { ok: false; error: string; status: number };

// Puts a recommended book on the recipient's Want to read shelf, remembering who sent it. A copy already
// on their shelf is left where it is (Will not read is overridden: they asked for it), and only gets the
// sender filled in if nobody was recorded yet.
export async function acceptRecommendation(notificationId: string, userId: string): Promise<AcceptResult> {
  const notFound = { ok: false, error: "That recommendation has gone.", status: 404 } as const;
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId || notification.type !== "BOOK_RECOMMENDED" || !notification.bookId) return notFound;
  if (await isBlockedEitherWay(userId, notification.actorId)) return notFound;
  const source = await prisma.book.findUnique({ where: { id: notification.bookId } });
  if (!source) return notFound;

  const shelf = await prisma.book.findMany({
    where: { userId, OR: [...(source.workKey ? [{ workKey: source.workKey }] : []), { title: { equals: source.title, mode: "insensitive" as const } }] },
    select: { id: true, title: true, author: true, workKey: true, status: true, recommendedById: true, recommendedByName: true },
  });
  const existing = shelf.find((b) => sameBook(b, source));
  if (existing) {
    const noSender = !existing.recommendedById && !existing.recommendedByName;
    if (noSender || existing.status === "NOT_INTERESTED") {
      await prisma.book.update({
        where: { id: existing.id },
        data: {
          ...(noSender && { recommendedById: notification.actorId }),
          ...(existing.status === "NOT_INTERESTED" && { status: "NOT_STARTED" }),
        },
      });
    }
    return { ok: true, bookId: existing.id, added: false };
  }

  // Filed under the sender's catalog Work (no Open Library call: their add made it).
  const catalog = await linkCatalog({ workKey: source.workKey, title: source.title, author: source.author, pages: source.pages || null, coverUrl: source.coverImage || null });
  const book = await prisma.book.create({
    data: {
      userId,
      title: source.title,
      author: source.author,
      description: source.description,
      coverImage: source.coverImage,
      cardColour: source.cardColour,
      genre: source.genre,
      pages: source.pages,
      workKey: source.workKey,
      ...catalogIds(catalog),
      audioMinutes: source.audioMinutes,
      progressUnit: source.progressUnit,
      currentMinute: source.progressUnit === "MINUTES" ? 0 : null,
      status: "NOT_STARTED",
      recommendedById: notification.actorId,
    },
  });
  await prisma.activity.create({ data: { userId, bookId: book.id, type: "ADDED_BOOK" } });
  return { ok: true, bookId: book.id, added: true };
}
