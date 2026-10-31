import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { assembleSuggestions, type PersonSuggestion } from "@/lib/peopleSuggestRules";
import { notSuspendedWhere, privacySelect, searchableProfileWhere } from "@/lib/privacy";
import { staffBadgeSelect } from "@/lib/staffBadge";
import { SMALL_GROUP, SUGGESTION_INACTIVE_DAYS, SUGGESTION_WEIGHTS } from "@bookmark/shared/peopleSuggest";

export type { PersonSuggestion };

// People you may know (BOO-81). The scoring and wording are in packages/shared/src/peopleSuggest.ts.
//
// Only real connections count: they follow you, you share a club or a reading circle, or people you follow
// follow them. Liking the same genres or finishing the same books says nothing about knowing someone, so
// neither is used.
//
// Every request looks up, fresh: who the viewer follows, who follows them, blocks, dismissals, follow
// requests, clubs and circles, and then each candidate's profile, privacy and opt-out. Only finding
// friends of friends is slow for a big account, so that part (ids and a rough score, nothing else) is
// kept for an hour in PeopleSuggestionCache. Whatever a reason line says is checked again on the read
// it's shown on.
//
// Never suggested: the viewer, anyone they follow or asked to follow, Private profiles, a block either
// way, suspended or deleted accounts, people who opted out (hideFromSuggestions) and people they dismissed.

type Db = typeof prisma;

const CACHE_MS = 60 * 60 * 1000;
// Bounds on every query, so a reader following thousands costs the same as one following 300.
const FOF_SAMPLE = 300;
const FOF_ROWS = 5000;
const FOLLOWER_ROWS = 500;
const MATE_ROWS = 2000;
// How many candidates are looked at closely, after a rough first ranking.
const SHORTLIST = 300;
const CIRCLE_RECENT_DAYS = 365;

export interface CachedCandidate {
  id: string;
  // The rough score from friends of friends, for the shortlist only.
  score: number;
}

// ---- Friends of friends (the slow part, cached) ---------------------------------------------

export async function findSlowCandidates(viewer: { id: string }, db: Db = prisma): Promise<CachedCandidate[]> {
  const sample = await db.follow.findMany({ where: { followerId: viewer.id }, orderBy: { createdAt: "desc" }, take: FOF_SAMPLE, select: { followingId: true } });
  if (sample.length === 0) return [];
  const via = await db.follow.findMany({
    where: { followerId: { in: sample.map((f) => f.followingId) }, followingId: { not: viewer.id } },
    orderBy: { createdAt: "desc" },
    take: FOF_ROWS,
    select: { followingId: true },
  });
  const score = new Map<string, number>();
  for (const v of via) score.set(v.followingId, (score.get(v.followingId) ?? 0) + SUGGESTION_WEIGHTS.mutual);
  return Array.from(score, ([id, s]) => ({ id, score: s })).sort((a, b) => b.score - a.score).slice(0, SHORTLIST * 2);
}

async function slowCandidates(viewer: { id: string }, db: Db, now: Date): Promise<CachedCandidate[]> {
  const row = await db.peopleSuggestionCache.findUnique({ where: { userId: viewer.id } });
  if (row && now.getTime() - row.computedAt.getTime() < CACHE_MS) return row.candidates as unknown as CachedCandidate[];
  const candidates = await findSlowCandidates(viewer, db);
  const data = { candidates: candidates as unknown as Prisma.InputJsonValue, computedAt: now };
  await db.peopleSuggestionCache.upsert({ where: { userId: viewer.id }, create: { userId: viewer.id, ...data }, update: data });
  return candidates;
}

// ---- The database side -----------------------------------------------------------------------

const notOptedOut: Prisma.UserWhereInput = { OR: [{ hideFromSuggestions: { isSet: false } }, { hideFromSuggestions: null }, { hideFromSuggestions: false }] };
// Unset and null both mean "not part of a club" (MongoDB keeps them apart).
const notClubCircle: Prisma.BuddyReadWhereInput = { OR: [{ clubId: { isSet: false } }, { clubId: null }] };

export async function peopleYouMayKnow(viewer: { id: string }, opts: { limit?: number } = {}, db: Db = prisma, now = new Date()): Promise<PersonSuggestion[]> {
  const me = viewer.id;
  const [followingRows, followerRows, blockRows, dismissedRows, requestRows, myClubs, myCircles, slow] = await Promise.all([
    db.follow.findMany({ where: { followerId: me }, select: { followingId: true } }),
    db.follow.findMany({ where: { followingId: me }, orderBy: { createdAt: "desc" }, take: FOLLOWER_ROWS, select: { followerId: true } }),
    db.block.findMany({ where: { OR: [{ blockerId: me }, { blockedId: me }] }, select: { blockerId: true, blockedId: true } }),
    db.suggestionDismissal.findMany({ where: { userId: me }, select: { dismissedId: true } }),
    db.followRequest.findMany({ where: { requesterId: me }, select: { targetId: true } }),
    db.clubMember.findMany({ where: { userId: me }, select: { clubId: true } }),
    db.buddyReadMember.findMany({ where: { userId: me }, select: { buddyReadId: true } }),
    slowCandidates(viewer, db, now),
  ]);
  const following = followingRows.map((f) => f.followingId);
  const blocked = blockRows.map((b) => (b.blockerId === me ? b.blockedId : b.blockerId));

  const recentCircle = new Date(now.getTime() - CIRCLE_RECENT_DAYS * 86_400_000);
  const [clubs, circles] = await Promise.all([
    myClubs.length ? db.club.findMany({ where: { id: { in: myClubs.map((c) => c.clubId) }, status: "ACTIVE" }, select: { id: true, name: true } }) : [],
    myCircles.length
      ? db.buddyRead.findMany({
        where: { AND: [{ id: { in: myCircles.map((c) => c.buddyReadId) } }, notClubCircle, { OR: [{ status: "ACTIVE" }, { updatedAt: { gte: recentCircle } }] }] },
        select: { id: true, title: true, status: true },
      })
      : [],
  ]);
  const [clubRows, circleRows] = await Promise.all([
    clubs.length ? db.clubMember.findMany({ where: { clubId: { in: clubs.map((c) => c.id) }, userId: { not: me } }, take: MATE_ROWS, select: { clubId: true, userId: true } }) : [],
    circles.length ? db.buddyReadMember.findMany({ where: { buddyReadId: { in: circles.map((c) => c.id) }, userId: { not: me } }, take: MATE_ROWS, select: { buddyReadId: true, userId: true } }) : [],
  ]);
  // Member counts, so a big club or circle counts for less (SMALL_GROUP).
  const [clubSizes, circleSizes] = await Promise.all([
    clubs.length ? db.clubMember.groupBy({ by: ["clubId"], where: { clubId: { in: clubs.map((c) => c.id) } }, _count: { _all: true } }) : [],
    circles.length ? db.buddyReadMember.groupBy({ by: ["buddyReadId"], where: { buddyReadId: { in: circles.map((c) => c.id) } }, _count: { _all: true } }) : [],
  ]);
  const clubSize = new Map(clubSizes.map((c) => [c.clubId, c._count._all]));
  const circleSize = new Map(circleSizes.map((c) => [c.buddyReadId, c._count._all]));
  const clubName = new Map(clubs.map((c) => [c.id, c.name]));
  const circleOf = new Map(circles.map((c) => [c.id, c]));
  const clubMates = clubRows.map((m) => ({ userId: m.userId, clubName: clubName.get(m.clubId)!, clubSize: clubSize.get(m.clubId) ?? 0 }));
  const circleMates = circleRows.map((m) => ({
    userId: m.userId, title: circleOf.get(m.buddyReadId)!.title, active: circleOf.get(m.buddyReadId)!.status === "ACTIVE", size: circleSize.get(m.buddyReadId) ?? 0,
  }));

  // A rough ranking first, so only the likeliest few hundred are looked at closely.
  const excluded = new Set([me, ...following, ...blocked, ...dismissedRows.map((d) => d.dismissedId), ...requestRows.map((r) => r.targetId)]);
  const rough = new Map<string, number>();
  const add = (id: string, n: number) => { if (!excluded.has(id)) rough.set(id, (rough.get(id) ?? 0) + n); };
  for (const f of followerRows) add(f.followerId, SUGGESTION_WEIGHTS.followsYou);
  for (const m of clubMates) add(m.userId, m.clubSize <= SMALL_GROUP ? SUGGESTION_WEIGHTS.club : SUGGESTION_WEIGHTS.bigGroup);
  for (const m of circleMates) add(m.userId, m.size <= SMALL_GROUP ? SUGGESTION_WEIGHTS.circle : SUGGESTION_WEIGHTS.bigGroup);
  for (const c of slow) add(c.id, c.score);
  const shortlist = Array.from(rough).sort((a, b) => b[1] - a[1]).slice(0, SHORTLIST).map(([id]) => id);
  if (shortlist.length === 0) return [];

  const inactiveSince = new Date(now.getTime() - SUGGESTION_INACTIVE_DAYS * 86_400_000);
  const [users, activity] = await Promise.all([
    db.user.findMany({
      where: { AND: [{ id: { in: shortlist } }, searchableProfileWhere(now), notOptedOut] },
      select: {
        id: true, username: true, displayName: true, image: true, favColour: true, bio: true, createdAt: true,
        suspendedAt: true, suspendedUntil: true, hideFromSuggestions: true, ...privacySelect, ...staffBadgeSelect,
      },
    }),
    db.activity.groupBy({ by: ["userId"], where: { userId: { in: shortlist }, createdAt: { gte: inactiveSince } } }),
  ]);
  const ids = users.map((u) => u.id);

  // Who follows whom is checked here, on this read, not taken from the cache.
  const via = following.length && ids.length
    ? await db.follow.findMany({ where: { followerId: { in: following }, followingId: { in: ids } }, take: FOF_ROWS, select: { followerId: true, followingId: true } })
    : [];
  const viaUsers = via.length
    ? await db.user.findMany({
      where: { AND: [{ id: { in: Array.from(new Set(via.map((v) => v.followerId))) } }, notSuspendedWhere(now)] },
      select: { id: true, username: true, displayName: true, suspendedAt: true, suspendedUntil: true, ...privacySelect },
    })
    : [];

  return assembleSuggestions({
    viewerId: me,
    following,
    requested: requestRows.map((r) => r.targetId),
    blocked,
    dismissed: dismissedRows.map((d) => d.dismissedId),
    followers: followerRows.map((f) => f.followerId),
    clubMates,
    circleMates,
    via,
    viaUsers,
    recentlyActive: activity.map((a) => a.userId),
    users,
    now,
    limit: opts.limit,
  });
}
