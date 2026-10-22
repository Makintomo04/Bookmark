import type { BuddyReadInviteAudience, ListVisibility } from "@prisma/client";

// Community preferences: how the reader wants to meet other readers, rather than who can see them
// (that's lib/privacyRules.ts). Pure, so client components can read them off the user too.

export interface CommunityPreferences {
  buddyReadInvites: BuddyReadInviteAudience;
  showSpoilers: boolean;
  defaultListVisibility: ListVisibility;
}

// The User fields these need. Spread into a Prisma `select`.
export const preferencesSelect = {
  buddyReadInvites: true,
  showSpoilers: true,
  defaultListVisibility: true,
} as const;

type StoredPreferences = {
  buddyReadInvites?: BuddyReadInviteAudience | null;
  showSpoilers?: boolean | null;
  defaultListVisibility?: ListVisibility | null;
};

// Unset reads as the defaults, which match how things worked before these existed.
export function preferencesOf(user: StoredPreferences): CommunityPreferences {
  return {
    buddyReadInvites: user.buddyReadInvites ?? "EVERYONE",
    showSpoilers: user.showSpoilers ?? false,
    defaultListVisibility: user.defaultListVisibility ?? "PRIVATE",
  };
}

// Can someone invite this reader to a reading circle? `inviteeFollowsInviter` only matters for FOLLOWING.
export function acceptsBuddyReadInvite(invitee: CommunityPreferences, inviteeFollowsInviter: boolean): boolean {
  if (invitee.buddyReadInvites === "EVERYONE") return true;
  return invitee.buddyReadInvites === "FOLLOWING" && inviteeFollowsInviter;
}
