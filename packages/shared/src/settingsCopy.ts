import type { BuddyReadInviteAudience, ListVisibility, ProfileVisibility, ReviewCommentAudience, ReviewVisibility } from "./enums";

// The words for the privacy and community settings, shared by the web's settings and onboarding and the
// mobile app's, so both say exactly the same thing.

export type Option<T extends string> = { value: T; label: string };

export const PROFILE_OPTIONS: Option<ProfileVisibility>[] = [
  { value: "PUBLIC", label: "Public" },
  { value: "FOLLOWERS", label: "Followers only" },
  { value: "PRIVATE", label: "Private" },
];
export const REVIEW_OPTIONS: Option<ReviewVisibility>[] = [
  { value: "EVERYONE", label: "Everyone" },
  { value: "FOLLOWERS", label: "Followers" },
  { value: "ONLY_ME", label: "Only me" },
];
export const REVIEW_COMMENT_OPTIONS: Option<ReviewCommentAudience>[] = [
  { value: "EVERYONE", label: "Anyone who can read it" },
  { value: "FRIENDS", label: "Friends" },
  { value: "OFF", label: "Off" },
];
export const REVIEW_COMMENT_HINT: Record<ReviewCommentAudience, string> = {
  EVERYONE: "Anyone who can read a review can comment on it.",
  FRIENDS: "Only readers you follow who follow you back can comment. Anyone who can read the review can still read the comments.",
  OFF: "Nobody can add new comments. Comments already there stay until you delete them.",
};
export const INVITE_OPTIONS: Option<BuddyReadInviteAudience>[] = [
  { value: "EVERYONE", label: "Anyone" },
  { value: "FOLLOWING", label: "People I follow" },
  { value: "FRIENDS", label: "Friends" },
  { value: "NOBODY", label: "No one" },
];
export const LIST_OPTIONS: Option<ListVisibility>[] = [
  { value: "PRIVATE", label: "Private" },
  { value: "PUBLIC", label: "Public" },
];

export const PROFILE_HINT: Record<ProfileVisibility, string> = {
  PUBLIC: "Anyone can see your shelf, and your profile can show up in search engines.",
  FOLLOWERS: "Only followers you've approved see your shelf and activity. Others see your name and can ask to follow.",
  PRIVATE: "Only followers you approve see your shelf and reviews. You're hidden from search, and your activity stays out of feeds.",
};
export const INVITE_HINT: Record<BuddyReadInviteAudience, string> = {
  EVERYONE: "Any reader can invite you by username.",
  FOLLOWING: "Only readers you follow can invite you by username.",
  FRIENDS: "Only friends, readers you follow who follow you back, can invite you by username.",
  NOBODY: "Nobody can invite you by username.",
};
