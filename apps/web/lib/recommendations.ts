import { z } from "zod";
import prisma from "@/lib/db";
import { catalogIds, linkCatalog } from "@/lib/catalog";
import { createNotifications } from "@/lib/notifications";
import { handleOf } from "@/lib/handle";
import { isBlockedEitherWay } from "@/lib/buddyReadsServer";
import { sameBook } from "@/lib/workKey";
import { RECOMMEND_MAX_FRIENDS, RECOMMEND_MESSAGE_MAX, type RecommendFriend } from "@/lib/recommendRules";
import { coverToShare } from "@/lib/uploads";
import { sharedBookWhere } from "@/lib/privacy";
import { staffBadgeOf, staffBadgeSelect } from "./staffBadge";

export { RECOMMEND_MAX_FRIENDS, RECOMMEND_MESSAGE_MAX, type RecommendFriend } from "@/lib/recommendRules";

export const recommendSchema = z.object({
  usernames: z.array(z.string().trim().min(1).max(60)).min(1, "Pick at least one friend").max(RECOMMEND_MAX_FRIENDS, `Pick up to ${RECOMMEND_MAX_FRIENDS} friends`),
  message: z.string().trim().max(RECOMMEND_MESSAGE_MAX, `Keep the note to ${RECOMMEND_MESSAGE_MAX} characters`).optional(),
});

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
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, displayName: true, image: true, favColour: true, ...staffBadgeSelect } }),
    prisma.book.findMany({
      // A friend's private copy reads as not having it: sending it anyway is better than giving it away.
      where: { userId: { in: ids }, AND: [sharedBookWhere], OR: [...(book.workKey ? [{ workKey: book.workKey }] : []), { title: { equals: book.title, mode: "insensitive" as const } }] },
      select: { userId: true, title: true, author: true, workKey: true },
    }),
  ]);
  const owners = new Set(shelved.filter((b) => sameBook(b, book)).map((b) => b.userId));
  return users
    .filter((u) => u.username)
    .map((u) => ({ username: u.username!, displayName: u.displayName, image: u.image, favColour: u.favColour, staffBadge: staffBadgeOf(u), hasBook: owners.has(u.id) }))
    .sort((a, b) => Number(a.hasBook) - Number(b.hasBook) || a.username.localeCompare(b.username));
}

// What a recommendation points at: the sender's own copy, or, sent from a book page without it on their
// shelf, the catalogue Work.
export type RecommendTarget = { bookId: string } | { workId: string };

export type SendResult = { ok: true; sent: number; alreadySent: number } | { ok: false; error: string; status: number };

export async function sendRecommendation(senderId: string, target: RecommendTarget, usernames: string[], message: string | null): Promise<SendResult> {
  const handles = Array.from(new Set(usernames.map((u) => handleOf(u.replace(/^@/, "")))));
  const [friendIds, recipients] = await Promise.all([
    mutualFollowIds(senderId),
    prisma.user.findMany({ where: { username: { in: handles, mode: "insensitive" } }, select: { id: true } }),
  ]);
  const friends = new Set(friendIds);
  const ids = recipients.map((r) => r.id).filter((id) => friends.has(id));
  if (ids.length === 0) return { ok: false, error: "You can only send books to friends who follow you back.", status: 403 };

  // Sending the same book to the same friend twice is a no-op, so nobody is nagged.
  const already = await prisma.notification.findMany({
    where: { actorId: senderId, type: "BOOK_RECOMMENDED", ...target, userId: { in: ids } },
    select: { userId: true },
  });
  const sentBefore = new Set(already.map((n) => n.userId));
  const fresh = ids.filter((id) => !sentBefore.has(id));
  if (fresh.length > 0) {
    await createNotifications(
      fresh.map((userId) => ({ userId, actorId: senderId, type: "BOOK_RECOMMENDED" as const, ...target, message })),
    );
  }
  return { ok: true, sent: fresh.length, alreadySent: sentBefore.size };
}

// A recommendation's book, the way acceptRecommendation copies it: the sender's copy, else the catalogue
// Work's details (its middle edition's length, like the book page).
async function recommendedSource(notification: { bookId: string | null; workId: string | null }) {
  if (notification.bookId) return prisma.book.findUnique({ where: { id: notification.bookId } });
  if (!notification.workId) return null;
  const work = await prisma.work.findUnique({
    where: { id: notification.workId },
    select: { title: true, authors: true, description: true, coverUrl: true, openLibraryKey: true, hardcoverId: true, editions: { select: { pages: true }, take: 20 } },
  });
  if (!work) return null;
  const pages = work.editions.flatMap((e) => (e.pages ? [e.pages] : [])).sort((a, b) => a - b);
  return {
    title: work.title,
    author: work.authors[0] ?? "Unknown",
    description: work.description,
    coverImage: work.coverUrl ?? "",
    cardColour: null,
    genre: null,
    pages: pages.length ? pages[Math.floor(pages.length / 2)] : 0,
    workKey: work.openLibraryKey,
    hardcoverId: work.hardcoverId,
    audioMinutes: null,
    progressUnit: null,
  };
}

export type AcceptResult = { ok: true; bookId: string; added: boolean } | { ok: false; error: string; status: number };

// Puts a recommended book on the recipient's Want to read shelf, remembering who sent it. A copy already
// on their shelf is left where it is (Will not read is overridden: they asked for it), and only gets the
// sender filled in if nobody was recorded yet.
export async function acceptRecommendation(notificationId: string, userId: string): Promise<AcceptResult> {
  const notFound = { ok: false, error: "That recommendation has gone.", status: 404 } as const;
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId || notification.type !== "BOOK_RECOMMENDED") return notFound;
  if (await isBlockedEitherWay(userId, notification.actorId)) return notFound;
  const source = await recommendedSource(notification);
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

  // Filed under the sender's catalog Work (no Open Library call: their add, or their send, made it).
  const catalog = await linkCatalog({
    workKey: source.workKey,
    hardcoverId: "hardcoverId" in source ? source.hardcoverId : null,
    title: source.title,
    author: source.author,
    pages: source.pages || null,
    coverUrl: source.coverImage || null,
  });
  const book = await prisma.book.create({
    data: {
      userId,
      title: source.title,
      author: source.author,
      description: source.description,
      // The sender's uploaded cover stays on their copy; this one takes the catalogue's.
      coverImage: (await coverToShare(source.coverImage, source, userId)) ?? "",
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
