import type { ProfileVisibility } from "./enums";

// Pure follow-request rules, safe for client components. lib/followRequests.ts has the database side.

// Whether following this reader needs their approval: anyone whose profile isn't public. Accounts made
// before privacy settings existed have no value stored and read as public (lib/privacyRules.ts).
export function needsFollowApproval(target: { profileVisibility?: ProfileVisibility | null }) {
  return (target.profileVisibility ?? "PUBLIC") !== "PUBLIC";
}

// Friends are readers who follow each other: no second relationship to keep track of, and the same
// meaning as sending a book (lib/recommendations.ts) and the FRIENDS reading circle invite audience.
export function areFriends(state: { isFollowing: boolean; followsYou: boolean }) {
  return state.isFollowing && state.followsYou;
}

// The follow button's label for each state. `followsYou` (they follow the viewer) turns "Following" into
// "Friends" and "Follow" into "Follow back"; a profile that needs approval is still "Ask to follow".
export function followButtonLabel(state: { isFollowing: boolean; requested: boolean; needsApproval: boolean; followsYou?: boolean }) {
  const followsYou = state.followsYou ?? false;
  if (state.isFollowing) return followsYou ? "Friends" : "Following";
  if (state.requested) return "Requested";
  if (state.needsApproval) return "Ask to follow";
  return followsYou ? "Follow back" : "Follow";
}
