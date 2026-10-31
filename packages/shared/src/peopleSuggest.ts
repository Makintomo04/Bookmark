// People you may know (BOO-81): how a suggested reader is scored and the one-line reason shown with them.
// Pure, so the web and mobile cards and the tests share one copy. The database work, and every privacy
// filter, is in apps/web/lib/peopleSuggest.ts: by the time signals reach here they're already ones the
// viewer may see.

import type { StaffBadgeKind } from "./staffBadge";

// One suggestion as GET /api/users/suggestions sends it.
export interface PersonSuggestion {
  username: string;
  displayName: string | null;
  image: string | null;
  favColour: string | null;
  staffBadge: StaffBadgeKind | null;
  // Only for profiles the viewer could read anyway (public ones).
  bio: string | null;
  reason: string;
  followsYou: boolean;
  needsApproval: boolean;
}

// What links the viewer to one suggested reader.
export interface SuggestionSignals {
  // They follow the viewer, who doesn't follow them back.
  followsYou: boolean;
  // Clubs both are in, with how many members each has.
  clubs: { name: string; size: number }[];
  // Reading circles both are in (outside clubs, which count above), by book title.
  circles: { title: string; active: boolean; size: number }[];
  // People the viewer follows who follow this reader, by display name, only those whose follow list the
  // viewer may see.
  mutuals: string[];
  // Nothing posted for SUGGESTION_INACTIVE_DAYS: still suggested, lower down.
  inactive: boolean;
}

export const SUGGESTION_WEIGHTS = {
  followsYou: 40,
  club: 30,
  maxClubs: 2,
  circle: 25,
  maxCircles: 2,
  mutual: 10,
  maxMutuals: 5,
  // A club or circle bigger than SMALL_GROUP says less: most of its members are strangers to each other.
  bigGroup: 10,
} as const;

export const SMALL_GROUP = 15;

export const SUGGESTION_INACTIVE_DAYS = 180;
// How many suggestions a list shows, and how many people the viewer follows before the feed stops
// offering them.
export const SUGGESTION_LIMIT = 20;
export const FEED_SUGGESTION_FOLLOWING = 5;

type Kind = "followsYou" | "club" | "circle" | "mutual";

// The best `max` groups' points: full weight for a small group, bigGroup for a big one.
function groupPoints(groups: { size: number }[], weight: number, max: number) {
  return groups.map((g) => (g.size <= SMALL_GROUP ? weight : SUGGESTION_WEIGHTS.bigGroup)).sort((a, b) => b - a).slice(0, max).reduce((sum, p) => sum + p, 0);
}

// Each signal's points, strongest first on a tie (the order the reason prefers).
function points(s: SuggestionSignals): [Kind, number][] {
  const w = SUGGESTION_WEIGHTS;
  return [
    ["followsYou", s.followsYou ? w.followsYou : 0],
    ["club", groupPoints(s.clubs, w.club, w.maxClubs)],
    ["circle", groupPoints(s.circles, w.circle, w.maxCircles)],
    ["mutual", Math.min(s.mutuals.length, w.maxMutuals) * w.mutual],
  ];
}

// 0 means there's nothing to suggest them on.
export function suggestionScore(s: SuggestionSignals): number {
  const total = points(s).reduce((sum, [, p]) => sum + p, 0);
  return s.inactive ? total / 2 : total;
}

const others = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

// The reason line: why the strongest signal links them. Null when there's no signal.
export function suggestionReason(s: SuggestionSignals): string | null {
  const best = points(s).reduce<[Kind, number] | null>((top, p) => (p[1] > 0 && (!top || p[1] > top[1]) ? p : top), null);
  if (!best) return null;
  switch (best[0]) {
    case "followsYou":
      return "Follows you";
    case "club": {
      // The smallest club names the closest tie.
      const name = [...s.clubs].sort((a, b) => a.size - b.size)[0].name;
      return s.clubs.length === 1 ? `In ${name} with you` : `In ${name} and ${others(s.clubs.length - 1, "more club", "more clubs")} with you`;
    }
    case "circle": {
      const c = [...s.circles].sort((a, b) => Number(b.active) - Number(a.active) || a.size - b.size)[0];
      return `${c.active ? "Reading" : "Read"} ${c.title} with you`;
    }
    case "mutual":
      return followedByText(s.mutuals);
  }
}

// The same wording as reader search's reasons.
export function followedByText(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `Followed by ${names[0]}`;
  if (names.length === 2) return `Followed by ${names[0]} and ${names[1]}`;
  return `Followed by ${names[0]} and ${names.length - 1} others`;
}

// Highest score first, then by name so the order is stable. Those with nothing to go on are left out.
export function rankSuggestions<T extends { signals: SuggestionSignals; name: string }>(people: T[], limit = SUGGESTION_LIMIT): (T & { score: number; reason: string })[] {
  return people
    .map((p) => ({ ...p, score: suggestionScore(p.signals), reason: suggestionReason(p.signals) ?? "" }))
    .filter((p) => p.score > 0 && p.reason)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }))
    .slice(0, limit);
}

// Whether the feed offers suggestions: only while the reader follows only a few people.
export const feedShowsSuggestions = (followingCount: number) => followingCount < FEED_SUGGESTION_FOLLOWING;

// The opt-out (User.hideFromSuggestions), worded for both apps' settings.
export const SUGGEST_ME_LABEL = "Suggest me to other readers";
export const SUGGEST_ME_HINT = "You can turn up in People you may know for readers you follow, and readers you share a club, a reading circle or a friend with. A private profile never does.";
