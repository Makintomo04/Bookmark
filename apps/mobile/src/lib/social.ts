import { mutate } from "swr";
import type { StaffBadgeKind } from "@bookmark/shared/staffBadge";
import { api } from "@/lib/api";

// Readers and what they do: the feed, notifications, profiles, following and blocking.

// staffBadge: their staff seal, where the server sends it (lists, comments, notifications).
export type Person = { username: string | null; displayName?: string | null; image: string | null; favColour: string | null; staffBadge?: StaffBadgeKind | null };

export type ActivityType = "ADDED_BOOK" | "STARTED_BOOK" | "COMPLETED_BOOK" | "DNF_BOOK" | "RATED_BOOK" | "REVIEWED_BOOK";

export interface Activity {
  id: string;
  type: ActivityType;
  createdAt: string;
  user: Person & { username: string };
  // `id` is the reader's copy, for reporting a review. Missing from older servers.
  book: { id?: string | null; title: string; author: string; coverImage: string; cardColour: string | null; rating: number | null; review: string | null; reviewSpoiler: boolean | null } | null;
}

// The web's ActivityFeedItem wording. "Shelf", not "list": lists are the curated recommendation lists.
export const ACTIVITY_COPY: Record<ActivityType, (title: string) => string> = {
  ADDED_BOOK: (title) => `added ${title} to their shelf`,
  STARTED_BOOK: (title) => `started reading ${title}`,
  COMPLETED_BOOK: (title) => `finished ${title}`,
  DNF_BOOK: (title) => `stopped reading ${title}`,
  RATED_BOOK: (title) => `rated ${title}`,
  REVIEWED_BOOK: (title) => `reviewed ${title}`,
};

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60]];

// "3 hours ago", "yesterday", "just now".
export function timeAgo(iso: string) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  for (const [unit, size] of STEPS) {
    if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}

const profilePath = (username: string) => `/api/users/${encodeURIComponent(username)}`;
// The profile screen's SWR key: ?books=preview sends what the screen shows (all they're reading, the newest of
// Finished and Want to read, the newest reviews) and the counts, not a shelf of thousands. Anything that
// refreshes a profile must use this same key.
export const profileKey = (username: string) => `${profilePath(username)}?books=preview`;

// Follow, unfollow, ask to follow (a followers-only or private profile) or withdraw the request: the
// web's FollowButton, one toggle on the server.
export async function toggleFollow(username: string) {
  const result = await api.post<{ isFollowing: boolean; requested: boolean }>(`${profilePath(username)}/follow`);
  await Promise.all([mutate(profileKey(username)), mutate("/api/feed")]);
  return result;
}

// Blocking hides the two readers from each other everywhere (feeds, circles, search) and ends any follow.
export async function setBlocked(username: string, blocked: boolean) {
  if (blocked) await api.post(`${profilePath(username)}/block`);
  else await api.delete(`${profilePath(username)}/block`);
  await Promise.all([mutate(profileKey(username)), mutate("/api/feed"), mutate("/api/buddy-reads")]);
}

export async function answerFollowRequest(username: string, action: "accept" | "decline") {
  const result = await api.post<{ accepted: boolean }>(`/api/follow-requests/from/${encodeURIComponent(username)}`, { action });
  await Promise.all([mutate("/api/notifications"), mutate("/api/follow-requests")]);
  return result;
}
