import { booksReadCount } from "@/lib/readerTier";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/db";
import { blockedUserIds, canView, privacyOf, privacySelect, publicProfileWhere, searchableProfileWhere } from "@/lib/privacy";
import { readerName } from "@/lib/profile";
import { staffBadgeOf, staffBadgeSelect } from "@/lib/staffBadge";
import { NextResponse } from "next/server";

// Finding readers by name or @handle (BOO-53).
//   GET /api/users/search?q=pri&offset=0   → { readers, hasMore }
// Signed in: anyone whose profile isn't private (a followers-only reader needs to be findable to be
// followed), each with a reason they might be someone you know. Signed out: public profiles only, and
// nothing about who follows whom.
const PAGE = 20;
// The closest matches are picked from this many, so "Show more" pages through a stable order.
const CANDIDATES = 60;

export interface ReaderResult {
  username: string;
  displayName: string | null;
  image: string | null;
  favColour: string | null;
  staffBadge: ReturnType<typeof staffBadgeOf>;
  bio: string | null;
  _count?: { books: number };
  isFollowing: boolean;
  // "Follows you", "Followed by Sam and 2 others": only ever names people whose follows the viewer may see.
  reason: string | null;
}

export async function GET(req: Request) {
  const viewer = await getCurrentUser();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim().replace(/^@/, "");
  const offset = Math.max(0, Math.min(CANDIDATES, Number(searchParams.get("offset")) || 0));
  if (!query || query.length < 2) {
    return NextResponse.json({ readers: [], hasMore: false });
  }

  // Private profiles never turn up, and a block in either direction hides the pair from each other.
  const blocked = viewer ? await blockedUserIds(viewer.id) : [];
  const users = await prisma.user.findMany({
    where: {
      AND: [
        { OR: [{ username: { contains: query, mode: "insensitive" } }, { displayName: { contains: query, mode: "insensitive" } }] },
        ...(viewer ? [{ id: { notIn: [viewer.id, ...blocked] } }] : []),
        viewer ? searchableProfileWhere() : publicProfileWhere(),
      ],
    },
    select: { id: true, username: true, displayName: true, image: true, favColour: true, bio: true, ...booksReadCount, ...privacySelect, ...staffBadgeSelect },
    take: CANDIDATES,
  });
  const ids = users.map((u) => u.id);

  const reasons = viewer ? await socialReasons(viewer.id, ids) : null;
  const q = query.toLowerCase();
  // Exact handle first, then people with a reason (the more mutuals the higher), then names that start
  // with what was typed, then the rest by name.
  const rank = (u: (typeof users)[number]) => {
    const r = reasons?.get(u.id);
    return [
      u.username?.toLowerCase() === q ? 0 : 1,
      -(r ? r.mutuals.length + (r.followsYou ? 1 : 0) : 0),
      u.username?.toLowerCase().startsWith(q) || u.displayName?.toLowerCase().startsWith(q) ? 0 : 1,
    ];
  };
  const ranked = users
    .map((u) => ({ u, key: rank(u) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || readerName(a.u).localeCompare(readerName(b.u)))
    .map((x) => x.u);
  const page = ranked.slice(offset, offset + PAGE);

  // A followers-only reader shows up so they can be followed, but their bio and count stay with their followers.
  const readers: ReaderResult[] = page.map(({ id, username, displayName, image, favColour, bio, _count, role, isStaff, ...privacy }) => {
    const r = reasons?.get(id);
    const isFollowing = !!r?.isFollowing;
    const relation = { isSelf: false, isFollower: isFollowing, blocked: null };
    const open = canView(relation, privacyOf(privacy), "profile");
    // The seal shows for anyone who turns up, like their name; the role fields it comes from stay here.
    const staffBadge = staffBadgeOf({ role, isStaff, hideStaffBadge: privacy.hideStaffBadge });
    return { username: username!, displayName, image, favColour, staffBadge, bio: open ? bio : null, ...(open ? { _count } : {}), isFollowing, reason: r ? reasonText(r) : null };
  });
  return NextResponse.json({ readers, hasMore: ranked.length > offset + PAGE });
}

interface Reason {
  isFollowing: boolean;
  followsYou: boolean;
  // People the viewer follows who follow this reader, and whose follows the viewer may see.
  mutuals: string[];
}

// Who of the people you follow also follow each result, and who follows you back. A name is only used
// when that person's follow list is visible to you (canView "followCounts"), so a reason never shows
// a follow someone has hidden.
async function socialReasons(viewerId: string, ids: string[]): Promise<Map<string, Reason>> {
  const reasons = new Map<string, Reason>();
  if (!ids.length) return reasons;
  const [mine, back] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }),
    prisma.follow.findMany({ where: { followerId: { in: ids }, followingId: viewerId }, select: { followerId: true } }),
  ]);
  const following = new Set(mine.map((f) => f.followingId));
  const followsYou = new Set(back.map((f) => f.followerId));

  const via = following.size
    ? await prisma.follow.findMany({ where: { followerId: { in: Array.from(following) }, followingId: { in: ids } }, select: { followerId: true, followingId: true } })
    : [];
  const people = via.length
    ? await prisma.user.findMany({ where: { id: { in: Array.from(new Set(via.map((v) => v.followerId))) } }, select: { id: true, username: true, displayName: true, ...privacySelect } })
    : [];
  const shown = new Map(
    people
      .filter((p) => canView({ isSelf: false, isFollower: true, blocked: null }, privacyOf(p), "followCounts"))
      .map((p) => [p.id, readerName(p)]),
  );

  for (const id of ids) {
    const mutuals = via.filter((v) => v.followingId === id && shown.has(v.followerId)).map((v) => shown.get(v.followerId)!);
    const r = { isFollowing: following.has(id), followsYou: followsYou.has(id), mutuals };
    if (r.isFollowing || r.followsYou || mutuals.length) reasons.set(id, r);
  }
  return reasons;
}

function reasonText(r: Reason): string | null {
  if (r.followsYou && !r.isFollowing) return "Follows you";
  if (r.mutuals.length === 1) return `Followed by ${r.mutuals[0]}`;
  if (r.mutuals.length === 2) return `Followed by ${r.mutuals[0]} and ${r.mutuals[1]}`;
  if (r.mutuals.length > 2) return `Followed by ${r.mutuals[0]} and ${r.mutuals.length - 1} others`;
  if (r.followsYou) return "Follows you";
  return null;
}
