import type { BuddyReadInviteAudience, ListVisibility } from "./enums";
import { entitlementsSelect, planOf } from "./entitlements";

// Community preferences: how the reader wants to meet other readers, rather than who can see them
// (that's lib/privacyRules.ts), and which optional features they want. Pure, so client components can
// read them off the user too.

export interface CommunityPreferences {
  buddyReadInvites: BuddyReadInviteAudience;
  showSpoilers: boolean;
  defaultListVisibility: ListVisibility;
  // The reader-facing AI features: Ask the shelf and Catch me up recaps. Opt-in on free, on by default
  // on Plus; an explicit choice either way sticks. Import matching isn't one of them: it never shows
  // AI text and only picks among search results.
  aiFeatures: boolean;
}

// The User fields these need. Spread into a Prisma `select`. The plan fields decide aiFeatures' default.
export const preferencesSelect = {
  buddyReadInvites: true,
  showSpoilers: true,
  defaultListVisibility: true,
  aiFeatures: true,
  showRecaps: true,
  ...entitlementsSelect,
} as const;

type StoredPreferences = {
  buddyReadInvites?: BuddyReadInviteAudience | null;
  showSpoilers?: boolean | null;
  defaultListVisibility?: ListVisibility | null;
  aiFeatures?: boolean | null;
  // The old recaps switch, from before aiFeatures. Only its "off" still counts, while aiFeatures is unset.
  showRecaps?: boolean | null;
} & Parameters<typeof planOf>[0];

// Unset reads as the defaults, which match how things worked before these existed, except AI, which
// starts off for free accounts.
export function preferencesOf(user: StoredPreferences, now = new Date()): CommunityPreferences {
  return {
    buddyReadInvites: user.buddyReadInvites ?? "EVERYONE",
    showSpoilers: user.showSpoilers ?? false,
    defaultListVisibility: user.defaultListVisibility ?? "PRIVATE",
    aiFeatures: user.aiFeatures ?? (planOf(user, now) === "PLUS" && user.showRecaps !== false),
  };
}

// Can someone invite this reader to a reading circle? `inviteeFollowsInviter` only matters for FOLLOWING.
export function acceptsBuddyReadInvite(invitee: CommunityPreferences, inviteeFollowsInviter: boolean): boolean {
  if (invitee.buddyReadInvites === "EVERYONE") return true;
  return invitee.buddyReadInvites === "FOLLOWING" && inviteeFollowsInviter;
}
