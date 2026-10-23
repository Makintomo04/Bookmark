import { mutate } from "swr";
import { api } from "@/lib/api";

// Readers and what they do: the feed, notifications, profiles, following and blocking.

export type Person = { username: string | null; image: string | null; favColour: string | null };

export type ActivityType = "ADDED_BOOK" | "STARTED_BOOK" | "COMPLETED_BOOK" | "DNF_BOOK" | "RATED_BOOK" | "REVIEWED_BOOK";

export interface Activity {
  id: string;
  type: ActivityType;
  createdAt: string;
  user: Person & { username: string };
  book: { title: string; author: string; coverImage: string; cardColour: string | null; rating: number | null; review: string | null; reviewSpoiler: boolean | null } | null;
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

const profileKey = (username: string) => `/api/users/${encodeURIComponent(username)}`;

// Follow, unfollow, ask to follow (a followers-only or private profile) or withdraw the request: the
// web's FollowButton, one toggle on the server.
export async function toggleFollow(username: string) {
  const result = await api.post<{ isFollowing: boolean; requested: boolean }>(`${profileKey(username)}/follow`);
  await Promise.all([mutate(profileKey(username)), mutate("/api/feed")]);
  return result;
}

// Blocking hides the two readers from each other everywhere (feeds, circles, search) and ends any follow.
export async function setBlocked(username: string, blocked: boolean) {
  if (blocked) await api.post(`${profileKey(username)}/block`);
  else await api.delete(`${profileKey(username)}/block`);
  await Promise.all([mutate(profileKey(username)), mutate("/api/feed"), mutate("/api/buddy-reads")]);
}

export async function answerFollowRequest(username: string, action: "accept" | "decline") {
  const result = await api.post<{ accepted: boolean }>(`/api/follow-requests/from/${encodeURIComponent(username)}`, { action });
  await Promise.all([mutate("/api/notifications"), mutate("/api/follow-requests")]);
  return result;
}
