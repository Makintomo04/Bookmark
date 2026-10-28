import type { ProfileVisibility, ReviewVisibility } from "./enums";

// The privacy rules as pure functions, with no database access, so client components can use the
// same answers the server enforces (e.g. labelling the owner's own hidden reviews). Servers should
// import from lib/privacy.ts, which re-exports these alongside the database helpers.

export interface PrivacySettings {
  profileVisibility: ProfileVisibility;
  reviewVisibility: ReviewVisibility;
  hideWantToRead: boolean;
  hideFollowCounts: boolean;
  hideFavourites: boolean;
  // A librarian hiding their badge (staffBadge.ts). Only offered to librarians.
  hideStaffBadge: boolean;
}

// The User fields privacy needs. Spread into a Prisma `select`.
export const privacySelect = {
  profileVisibility: true,
  reviewVisibility: true,
  hideWantToRead: true,
  hideFollowCounts: true,
  hideFavourites: true,
  hideStaffBadge: true,
} as const;

type StoredPrivacy = {
  profileVisibility?: ProfileVisibility | null;
  reviewVisibility?: ReviewVisibility | null;
  hideWantToRead?: boolean | null;
  hideFollowCounts?: boolean | null;
  hideFavourites?: boolean | null;
  hideStaffBadge?: boolean | null;
};

// Accounts made before privacy settings existed have the fields unset: they read as the defaults.
export function privacyOf(user: StoredPrivacy): PrivacySettings {
  return {
    profileVisibility: user.profileVisibility ?? "PUBLIC",
    reviewVisibility: user.reviewVisibility ?? "EVERYONE",
    hideWantToRead: user.hideWantToRead ?? false,
    hideFollowCounts: user.hideFollowCounts ?? false,
    hideFavourites: user.hideFavourites ?? false,
    hideStaffBadge: user.hideStaffBadge ?? false,
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
// a block in either direction hides everything.
export function canView(relation: Relation, owner: PrivacySettings, what: Viewable): boolean {
  if (relation.isSelf) return true;
  if (relation.blocked) return false;

  const profile = audienceAllows(
    owner.profileVisibility === "PUBLIC" ? "everyone" : owner.profileVisibility === "FOLLOWERS" ? "followers" : "nobody",
    relation,
  );
  switch (what) {
    case "profile":
    case "activity":
      return profile;
    case "wantToRead":
      return profile && !owner.hideWantToRead;
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
  const onlyOwner = !!book.reviewPrivate || removed || owner.reviewVisibility === "ONLY_ME" || owner.profileVisibility === "PRIVATE";
  return { review: text, reviewSpoiler: !!book.reviewSpoiler, reviewHidden: relation.isSelf && onlyOwner, reviewRemoved: relation.isSelf && removed };
}
