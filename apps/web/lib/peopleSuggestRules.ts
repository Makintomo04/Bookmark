import { canView, privacyOf } from "@bookmark/shared/privacyRules";
import { readerName } from "@bookmark/shared/profile";
import { isSuspended } from "@bookmark/shared/roles";
import { staffBadgeOf } from "@bookmark/shared/staffBadge";
import { rankSuggestions, SUGGESTION_INACTIVE_DAYS, SUGGESTION_LIMIT, type PersonSuggestion, type SuggestionSignals } from "@bookmark/shared/peopleSuggest";

// People you may know (BOO-81): putting one reader's suggestions together from rows already fetched
// (lib/peopleSuggest.ts does the queries). Pure, so every rule about who may be suggested and what a
// reason may give away is tested without a database (scripts/test/peopleSuggest.test.ts). The queries
// filter the same way; this is the check that counts.

export type { PersonSuggestion };

export interface CandidateUser {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  favColour: string | null;
  bio: string | null;
  createdAt: Date;
  suspendedAt?: Date | null;
  suspendedUntil?: Date | null;
  hideFromSuggestions?: boolean | null;
  role?: string | null;
  isStaff?: boolean | null;
  profileVisibility?: Parameters<typeof privacyOf>[0]["profileVisibility"];
  hideFollowCounts?: boolean | null;
  hideStaffBadge?: boolean | null;
}

export interface SuggestionInput {
  viewerId: string;
  // Everyone the viewer follows or has asked to follow, blocked either way, or dismissed.
  following: string[];
  requested: string[];
  blocked: string[];
  dismissed: string[];
  // People who follow the viewer.
  followers: string[];
  clubMates: { userId: string; clubName: string; clubSize: number }[];
  circleMates: { userId: string; title: string; active: boolean; size: number }[];
  // Follows from people the viewer follows (followerId) to a candidate (followingId).
  via: { followerId: string; followingId: string }[];
  // The people in `via`, for their names and whether their follow list is visible.
  viaUsers: { id: string; username: string | null; displayName: string | null; suspendedAt?: Date | null; suspendedUntil?: Date | null; profileVisibility?: CandidateUser["profileVisibility"]; hideFollowCounts?: boolean | null }[];
  // Candidates with something posted since the inactivity cut-off.
  recentlyActive: string[];
  users: CandidateUser[];
  now: Date;
  limit?: number;
}

export function assembleSuggestions(input: SuggestionInput): PersonSuggestion[] {
  const { now } = input;
  const excluded = new Set([input.viewerId, ...input.following, ...input.requested, ...input.blocked, ...input.dismissed]);
  const following = new Set(input.following);
  const followers = new Set(input.followers);
  const active = new Set(input.recentlyActive);
  const inactiveBefore = now.getTime() - SUGGESTION_INACTIVE_DAYS * 86_400_000;

  // A follow is only named when the viewer may see that person's follow list (the viewer follows them,
  // so they're a follower), as reader search does. Suspended readers aren't named at all.
  const names = new Map(
    input.viaUsers
      .filter((p) => following.has(p.id) && !input.blocked.includes(p.id) && !isSuspended(p, now) && canView({ isSelf: false, isFollower: true, blocked: null }, privacyOf(p), "followCounts"))
      .map((p) => [p.id, readerName(p)]),
  );

  const people = input.users.flatMap((u) => {
    if (excluded.has(u.id) || !u.username) return [];
    if (u.hideFromSuggestions || isSuspended(u, now)) return [];
    const visibility = privacyOf(u).profileVisibility;
    if (visibility === "PRIVATE") return [];
    const publicProfile = visibility === "PUBLIC";

    const signals: SuggestionSignals = {
      followsYou: followers.has(u.id),
      clubs: input.clubMates.filter((m) => m.userId === u.id).map((m) => ({ name: m.clubName, size: m.clubSize })),
      circles: input.circleMates.filter((m) => m.userId === u.id).map(({ title, active: on, size }) => ({ title, active: on, size })),
      mutuals: Array.from(new Set(input.via.filter((v) => v.followingId === u.id && names.has(v.followerId)).map((v) => v.followerId))).map((id) => names.get(id)!),
      inactive: !active.has(u.id) && u.createdAt.getTime() < inactiveBefore,
    };
    return [{ user: u, signals, name: readerName(u), publicProfile }];
  });

  return rankSuggestions(people, input.limit ?? SUGGESTION_LIMIT).map(({ user: u, reason, signals, publicProfile }) => ({
    username: u.username!,
    displayName: u.displayName,
    image: u.image,
    favColour: u.favColour,
    staffBadge: staffBadgeOf({ role: u.role, isStaff: u.isStaff, hideStaffBadge: u.hideStaffBadge }),
    bio: publicProfile ? u.bio : null,
    reason,
    followsYou: signals.followsYou,
    needsApproval: !publicProfile,
  }));
}
