import type { ProfileVisibility } from "@prisma/client";

// Pure follow-request rules, safe for client components. lib/followRequests.ts has the database side.

// Whether following this reader needs their approval: anyone whose profile isn't public. Accounts made
// before privacy settings existed have no value stored and read as public (lib/privacyRules.ts).
export function needsFollowApproval(target: { profileVisibility?: ProfileVisibility | null }) {
  return (target.profileVisibility ?? "PUBLIC") !== "PUBLIC";
}

// The follow button's label for each state.
export function followButtonLabel(state: { isFollowing: boolean; requested: boolean; needsApproval: boolean }) {
  if (state.isFollowing) return "Following";
  if (state.requested) return "Requested";
  return state.needsApproval ? "Ask to follow" : "Follow";
}
