import { cache } from "react";
import type { Prisma, ProfileVisibility } from "@prisma/client";
import prisma from "@/lib/db";
import { ANONYMOUS, canView, privacyOf, privacySelect, type Relation, type Viewable } from "@/lib/privacyRules";

// Every privacy and blocking rule lives here and in lib/privacyRules.ts. The profile page, the
// profile API, the feed, search, the sitemap and the share image all ask these instead of
// checking fields themselves.

export * from "@/lib/privacyRules";

// One lookup per viewer/owner pair per request.
export const getRelation = cache(async (viewerId: string | null | undefined, ownerId: string): Promise<Relation> => {
  if (!viewerId) return ANONYMOUS;
  if (viewerId === ownerId) return { isSelf: true, isFollower: false, blocked: null };
  const [follow, blocks] = await Promise.all([
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: ownerId } },
      select: { id: true },
    }),
    prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId, blockedId: ownerId }, { blockerId: ownerId, blockedId: viewerId }] },
      select: { blockerId: true },
    }),
  ]);
  // If both blocked each other, the owner's block wins: the viewer sees nothing either way.
  const blocked = blocks.some((b) => b.blockerId === ownerId) ? "byOwner" : blocks.length ? "byViewer" : null;
  return { isSelf: false, isFollower: !!follow, blocked };
});

// Everyone the user has blocked or been blocked by. Search and the feed leave them out.
export async function blockedUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return Array.from(new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId))));
}

// Unset reads as PUBLIC, so match it explicitly (MongoDB: unset and null are different things).
const visibilityIn = (values: ProfileVisibility[]): Prisma.UserWhereInput => ({
  OR: [
    { profileVisibility: { isSet: false } },
    { profileVisibility: null },
    { profileVisibility: { in: values } },
  ],
});

// Profiles anyone may see: the sitemap and anything else crawlable.
export const publicProfileWhere: Prisma.UserWhereInput = visibilityIn(["PUBLIC"]);
// Profiles that turn up in user search: not private (followers-only readers need to be findable to be followed).
export const searchableProfileWhere: Prisma.UserWhereInput = visibilityIn(["PUBLIC", "FOLLOWERS"]);

// True when a signed-out visitor can see this user's profile. For pages that show a user's
// reading to anyone (stats, Wrapped, share images): check this before rendering.
export async function isProfilePublic(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: privacySelect });
  return !!user && privacyOf(user).profileVisibility === "PUBLIC";
}

// The same check for a specific viewer (null when signed out), e.g. a signed-in follower opening
// a followers-only reader's Wrapped.
export async function canViewUser(viewerId: string | null | undefined, ownerId: string, what: Viewable = "profile") {
  const [owner, relation] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: privacySelect }),
    getRelation(viewerId, ownerId),
  ]);
  return !!owner && canView(relation, privacyOf(owner), what);
}

// canViewUser for a username. null when there's no such user.
export async function canViewUsername(viewerId: string | null | undefined, username: string, what: Viewable = "profile") {
  const owner = await prisma.user.findUnique({ where: { username }, select: { id: true, ...privacySelect } });
  if (!owner) return null;
  return canView(await getRelation(viewerId, owner.id), privacyOf(owner), what);
}
