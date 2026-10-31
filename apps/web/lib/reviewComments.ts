import { cache } from "react";
import prisma from "@/lib/db";
import { areFriends } from "@/lib/friends";
import { canCommentOnReview, getRelation, privacyOf, privacySelect, visibleReview, type Relation, type VisibleReview } from "@/lib/privacy";
import { staffBadgeOf, staffBadgeSelect } from "@/lib/staffBadge";
import { isObjectId } from "@/lib/staffUsers";
import type { SerializedReviewComment } from "@bookmark/shared/reviewComments";

export * from "@bookmark/shared/reviewComments";

// A review lives on the reviewer's copy of the book (Book), so a review is addressed by that copy's id.
// Everything about who may read or comment on one is decided here, so the page and the API routes can't
// disagree: a viewer who can't read the review gets null, which both treat as "not found" (blocks either
// way, suspended reviewers, private copies and private or removed reviews all look like a missing page).

const reviewBookSelect = {
  id: true, userId: true, title: true, author: true, coverImage: true, cardColour: true, rating: true,
  completedAt: true, workKey: true, workId: true, pages: true, isPrivate: true,
  review: true, reviewSpoiler: true, reviewPrivate: true, reviewHiddenAt: true,
} as const;

export interface ReviewContext {
  book: NonNullable<Awaited<ReturnType<typeof loadBook>>>;
  owner: { id: string; username: string | null; displayName: string | null; image: string | null; favColour: string | null; staffBadge: "team" | "librarian" | null };
  relation: Relation;
  shown: VisibleReview & { review: string };
  // May this viewer write a comment (new or reply) right now? Signed-out viewers can't.
  canComment: boolean;
  // The reviewer's setting, for telling a viewer why they can't.
  audience: "EVERYONE" | "FRIENDS" | "OFF";
}

const loadBook = (bookId: string) => prisma.book.findUnique({ where: { id: bookId }, select: reviewBookSelect });

async function contextFor(bookId: string, viewerId: string | null | undefined, expectedUsername?: string): Promise<ReviewContext | null> {
  if (!isObjectId(bookId)) return null;
  const book = await loadBook(bookId);
  if (!book || book.isPrivate && book.userId !== viewerId) return null;
  const owner = await prisma.user.findUnique({
    where: { id: book.userId },
    select: { id: true, username: true, displayName: true, image: true, favColour: true, ...privacySelect, ...staffBadgeSelect },
  });
  if (!owner) return null;
  if (expectedUsername && owner.username?.toLowerCase() !== expectedUsername.toLowerCase()) return null;
  const relation = await getRelation(viewerId, owner.id);
  if (relation.blocked) return null;
  const privacy = privacyOf(owner);
  const shown = visibleReview(book, relation, privacy);
  if (!shown.review) return null;
  const friends = viewerId && viewerId !== owner.id && privacy.reviewComments === "FRIENDS" ? await areFriends(viewerId, owner.id) : false;
  const { id, username, displayName, image, favColour } = owner;
  return {
    book,
    owner: { id, username, displayName, image, favColour, staffBadge: staffBadgeOf(owner) },
    relation,
    shown: shown as ReviewContext["shown"],
    canComment: !!viewerId && canCommentOnReview(relation, privacy, friends),
    audience: privacy.reviewComments,
  };
}

// The review at /u/<username>/reviews/<bookId> as this viewer may see it, or null.
export const getReviewContext = cache(contextFor);

// Comments are written by readers who may since have gone: their words stay under "Former reader".
const authorSelect = { username: true, displayName: true, image: true, favColour: true, ...staffBadgeSelect } as const;

export async function reviewCommentsFor(bookId: string, viewerId: string | null | undefined): Promise<SerializedReviewComment[]> {
  const rows = await prisma.reviewComment.findMany({ where: { bookId }, orderBy: { createdAt: "asc" } });
  const authors = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.userId))) } }, select: { id: true, ...authorSelect } });
  const byId = new Map(authors.map(({ id, role, isStaff, hideStaffBadge, ...a }) => [id, { ...a, staffBadge: staffBadgeOf({ role, isStaff, hideStaffBadge }) }]));
  // Comments from readers either side has blocked are left out, whoever's page it is.
  const blockedIds = viewerId ? new Set((await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] }, select: { blockerId: true, blockedId: true },
  })).map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId))) : new Set<string>();
  const serialize = (row: (typeof rows)[number]): SerializedReviewComment => ({
    id: row.id,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deleted: !!row.deletedAt,
    body: row.deletedAt ? null : row.body,
    mine: row.userId === viewerId,
    author: byId.get(row.userId) ?? null,
    replies: [],
  });
  const visible = rows.filter((r) => r.userId === viewerId || !blockedIds.has(r.userId));
  const top = visible.filter((r) => !r.parentId).map(serialize);
  const byParent = new Map(top.map((c) => [c.id, c]));
  for (const r of visible) if (r.parentId) byParent.get(r.parentId)?.replies.push(serialize(r));
  // A deleted comment with nothing left under it has no reason to show.
  return top.filter((c) => !c.deleted || c.replies.length > 0);
}
