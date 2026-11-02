import type { ProfileVisibility, ReviewCommentAudience, ReviewVisibility } from "./enums";

// The privacy rules as pure functions, with no database access, so client components can use the
// same answers the server enforces (e.g. labelling the owner's own hidden reviews). Servers should
// import from lib/privacy.ts, which re-exports these alongside the database helpers.

export interface PrivacySettings {
  profileVisibility: ProfileVisibility;
  reviewVisibility: ReviewVisibility;
  // Who may comment on their reviews, among those who can see them (canCommentOnReview).
  reviewComments: ReviewCommentAudience;
  hideWantToRead: boolean;
  // Currently reading (and paused), and Finished, each kept to themselves from the shelf's own menu (BOO-92).
  // Hidden Finished takes the books read count, the goal and the reviews on their profile with it; reviews
  // still show on each book's page by reviewVisibility. A reading circle still shows where its members are.
  hideReading: boolean;
  hideFinished: boolean;
  // The Did not finish shelf never shows to others; this keeps "stopped reading" out of followers' feeds too.
  hideDidNotFinish: boolean;
  hideFollowCounts: boolean;
  hideFavourites: boolean;
  // A librarian hiding their badge (staffBadge.ts). Only offered to librarians.
  hideStaffBadge: boolean;
  // This year's reading goal on their profile, for anyone who can see it. Opt-in; it never says "behind".
  showGoal: boolean;
}

// The User fields privacy needs. Spread into a Prisma `select`.
export const privacySelect = {
  profileVisibility: true,
  reviewVisibility: true,
  reviewComments: true,
  hideWantToRead: true,
  hideReading: true,
  hideFinished: true,
  hideDidNotFinish: true,
  hideFollowCounts: true,
  hideFavourites: true,
  hideStaffBadge: true,
  showGoal: true,
} as const;

type StoredPrivacy = {
  profileVisibility?: ProfileVisibility | null;
  reviewVisibility?: ReviewVisibility | null;
  reviewComments?: ReviewCommentAudience | null;
  hideWantToRead?: boolean | null;
  hideReading?: boolean | null;
  hideFinished?: boolean | null;
  hideDidNotFinish?: boolean | null;
  hideFollowCounts?: boolean | null;
  hideFavourites?: boolean | null;
  hideStaffBadge?: boolean | null;
  showGoal?: boolean | null;
};

// Accounts made before privacy settings existed have the fields unset: they read as the defaults.
export function privacyOf(user: StoredPrivacy): PrivacySettings {
  return {
    profileVisibility: user.profileVisibility ?? "PUBLIC",
    reviewVisibility: user.reviewVisibility ?? "EVERYONE",
    reviewComments: user.reviewComments ?? "EVERYONE",
    hideWantToRead: user.hideWantToRead ?? false,
    hideReading: user.hideReading ?? false,
    hideFinished: user.hideFinished ?? false,
    hideDidNotFinish: user.hideDidNotFinish ?? false,
    hideFollowCounts: user.hideFollowCounts ?? false,
    hideFavourites: user.hideFavourites ?? false,
    hideStaffBadge: user.hideStaffBadge ?? false,
    showGoal: user.showGoal ?? false,
  };
}

// How the viewer stands with the owner. Signed out is { isSelf: false, isFollower: false, blocked: null }.
export interface Relation {
  isSelf: boolean;
  isFollower: boolean;
  // "byViewer": the viewer blocked the owner. "byOwner": the owner blocked the viewer.
  blocked: "byViewer" | "byOwner" | null;
}

export const ANONYMOUS: Relation = { isSelf: false, isFollower: false, blocked: null };

export type Viewable =
  // The profile itself: shelf, bio, banner, stats, achievements, lists.
  | "profile"
  // Their activity in followers' feeds.
  | "activity"
  // The Want to read shelf.
  | "wantToRead"
  // Currently reading (and paused): the shelf, "Reading now", started-a-book posts, "reading this" faces.
  | "reading"
  // Finished: the shelf, books read, the goal, profile reviews, finished and rated posts, "read this" faces.
  | "finished"
  // That they stopped reading a book (the feed post). The shelf itself is always the reader's own.
  | "didNotFinish"
  // Their reviews, before each review's own private flag.
  | "reviews"
  // Follower and following counts, and the lists behind them.
  | "followCounts"
  // The favourites row on their profile.
  | "favourites";

function audienceAllows(audience: "everyone" | "followers" | "nobody", relation: Relation) {
  return audience === "everyone" || (audience === "followers" && relation.isFollower);
}

// Can someone with this relation to the owner see `what`? The owner always sees everything of theirs;
// a block in either direction hides everything. A profile that isn't public is for followers the owner
// approved (followRules.ts); PRIVATE is that plus hidden from search and out of followers' feeds.
export function canView(relation: Relation, owner: PrivacySettings, what: Viewable): boolean {
  if (relation.isSelf) return true;
  if (relation.blocked) return false;

  const profile = audienceAllows(owner.profileVisibility === "PUBLIC" ? "everyone" : "followers", relation);
  switch (what) {
    case "profile":
      return profile;
    case "activity":
      return profile && owner.profileVisibility !== "PRIVATE";
    case "wantToRead":
      return profile && !owner.hideWantToRead;
    case "reading":
      return profile && !owner.hideReading;
    case "finished":
      return profile && !owner.hideFinished;
    case "didNotFinish":
      return profile && !owner.hideDidNotFinish;
    case "followCounts":
      return profile && !owner.hideFollowCounts;
    case "favourites":
      return profile && !owner.hideFavourites;
    case "reviews":
      return profile && audienceAllows(
        owner.reviewVisibility === "EVERYONE" ? "everyone" : owner.reviewVisibility === "FOLLOWERS" ? "followers" : "nobody",
        relation,
      );
  }
}

// The shelf statuses this viewer may see books on. Did not finish and Will not read are always the reader's
// own; the rest follow the shelf's privacy. One list, so the profile, its shelves and their counts agree.
export type SharedStatus = "STARTED" | "PAUSED" | "COMPLETED" | "NOT_STARTED";
export function visibleStatuses(relation: Relation, owner: PrivacySettings): SharedStatus[] {
  return [
    ...(canView(relation, owner, "reading") ? ["STARTED", "PAUSED"] as const : []),
    ...(canView(relation, owner, "finished") ? ["COMPLETED"] as const : []),
    ...(canView(relation, owner, "wantToRead") ? ["NOT_STARTED"] as const : []),
  ];
}

export interface VisibleReview {
  review: string | null;
  reviewSpoiler: boolean;
  // Only ever true for the owner: tells them this review is hidden from everyone else.
  reviewHidden: boolean;
  // Only ever true for the owner: staff took this review down after a report, so nobody else sees it.
  reviewRemoved: boolean;
}

// The one place a review's text leaves the server. Anything that shows reviews (profile, feed)
// passes the stored book through this; a review the viewer can't see comes back as null.
// A review staff took down (reviewHiddenAt) is the reader's own from then on, like a private one.
export function visibleReview(
  book: { review?: string | null; reviewSpoiler?: boolean | null; reviewPrivate?: boolean | null; reviewHiddenAt?: Date | string | null },
  relation: Relation,
  owner: PrivacySettings,
): VisibleReview {
  const text = book.review?.trim() ? book.review : null;
  const removed = !!book.reviewHiddenAt;
  const allowed = relation.isSelf || (!book.reviewPrivate && !removed && canView(relation, owner, "reviews"));
  if (!text || !allowed) return { review: null, reviewSpoiler: false, reviewHidden: false, reviewRemoved: false };
  const onlyOwner = !!book.reviewPrivate || removed || owner.reviewVisibility === "ONLY_ME";
  return { review: text, reviewSpoiler: !!book.reviewSpoiler, reviewHidden: relation.isSelf && onlyOwner, reviewRemoved: relation.isSelf && removed };
}

// Can this viewer write a comment on the owner's review? Only asked once visibleReview() has said they can
// read it, so seeing the review is already settled; this is the owner's narrower choice of who may reply.
// OFF closes the thread to everyone, the owner included (they can still delete). `friends` is whether the
// two follow each other (lib/friends.ts), only read for FRIENDS.
export function canCommentOnReview(relation: Relation, owner: PrivacySettings, friends: boolean): boolean {
  if (owner.reviewComments === "OFF") return false;
  if (relation.isSelf) return true;
  if (relation.blocked) return false;
  return owner.reviewComments === "EVERYONE" || friends;
}
