import { cache } from "react";
import prisma from "@/lib/db";
import { QUEST_MEDAL_PREFIX, getMilestone } from "@/lib/achievements-catalog";
import { canView, getRelation, privacyOf, privacySelect, visibleReview, type PrivacySettings, type Relation } from "@/lib/privacy";
import { isFinishedBook } from "@/lib/readerTier";
import { resolveBanner } from "@/lib/banners";
import { supporterOf, supporterSelect } from "@/lib/supporter";
import { staffBadgeOf, staffBadgeSelect, type StaffBadgeKind } from "@/lib/staffBadge";

// The books a profile can show. Explicit fields so `userId` stays out of anything that leaves the
// server. Review text is loaded too, but only leaves through visibleReview() in profileForViewer().
const publicBookSelect = {
  id: true,
  title: true,
  author: true,
  description: true,
  coverImage: true,
  cardColour: true,
  status: true,
  genre: true,
  rating: true,
  timesRead: true,
  pages: true,
  currentPage: true,
  progressUnit: true,
  audioMinutes: true,
  currentMinute: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  workKey: true,
} as const;

// Everything any viewer might be shown. Server-only: profileForViewer() decides what leaves.
async function loadProfileRecord(username: string) {
  if (!username) return null;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      bio: true,
      image: true,
      banner: true,
      favColour: true,
      createdAt: true,
      ...privacySelect,
      ...supporterSelect,
      ...staffBadgeSelect,
      books: {
        where: { status: { in: ["STARTED", "COMPLETED", "NOT_STARTED"] } },
        orderBy: { createdAt: "desc" },
        select: { ...publicBookSelect, isPrivate: true, review: true, reviewSpoiler: true, reviewPrivate: true },
      },
      _count: { select: { followers: true, following: true } },
      achievements: { where: { NOT: { key: { startsWith: QUEST_MEDAL_PREFIX } } }, select: { key: true, earnedAt: true } },
      authorFollows: { orderBy: { name: "asc" }, select: { name: true, slug: true } },
    },
  });
  if (!user?.username) return null;
  return { ...user, username: user.username };
}

// One query per request however many places ask: generateMetadata, the page and the API route share it.
const getProfileRecord = cache(loadProfileRecord);
type ProfileRecord = NonNullable<Awaited<ReturnType<typeof loadProfileRecord>>>;

// What a profile shows when the viewer can't see it: enough to say whose it is, nothing about their reading.
export interface RestrictedProfile {
  username: string;
  image: string | null;
  favColour: string | null;
  // Shown even on a private profile, so a real staff account can be told from someone pretending.
  staffBadge: StaffBadgeKind | null;
}

export type RestrictedReason =
  // Profile set to Private.
  | "private"
  // Followers only, and the viewer doesn't follow them (or is signed out).
  | "followers"
  // The viewer blocked them. The viewer can unblock from the page.
  | "blockedByViewer"
  // They blocked the viewer. Shown as "not available", so a block isn't announced.
  | "unavailable";

// The central serializer: the profile as this viewer may see it. Private books, Want to read, reviews
// and follow counts are filtered here, so callers can't forget a rule.
function profileForViewer(record: ProfileRecord, relation: Relation, privacy: PrivacySettings) {
  const showWantToRead = canView(relation, privacy, "wantToRead");
  const showCounts = canView(relation, privacy, "followCounts");
  const books = record.books
    // Private books are the owner's alone: they see them on their own profile, marked, and nobody else does.
    .filter((b) => !b.isPrivate || relation.isSelf)
    .filter((b) => b.status !== "NOT_STARTED" || showWantToRead)
    .map(({ review, reviewSpoiler, reviewPrivate, isPrivate, ...book }) => ({
      ...book,
      isPrivate: !!isPrivate,
      ...visibleReview({ review, reviewSpoiler, reviewPrivate }, relation, privacy),
    }));
  return {
    username: record.username,
    bio: record.bio,
    image: record.image,
    // A reader who hasn't chosen a banner gets the preset seeded from their id, same as they see themselves.
    banner: resolveBanner(record.banner, record.id),
    favColour: record.favColour,
    // The plan itself never leaves; the supporter badge is the public part of it.
    ...supporterOf(record),
    // "team" or "librarian". The role itself never leaves.
    staffBadge: staffBadgeOf(record),
    createdAt: record.createdAt,
    books,
    achievements: record.achievements,
    // Authors they follow. Shown to whoever can see the profile, like their shelves.
    followedAuthors: record.authorFollows,
    // null when hidden. The owner always gets them; ProfileHead hides the numbers itself.
    followerCount: showCounts ? record._count.followers : null,
    followingCount: showCounts ? record._count.following : null,
  };
}

export type PublicProfileData = ReturnType<typeof profileForViewer>;
export type PublicBook = PublicProfileData["books"][number];

export type ProfileView =
  | { access: "full"; userId: string; relation: Relation; privacy: PrivacySettings; profile: PublicProfileData }
  | { access: "restricted"; userId: string; relation: Relation; privacy: PrivacySettings; reason: RestrictedReason; profile: RestrictedProfile };

// A profile as `viewerId` (null when signed out) may see it, or null if there's no such user.
// `userId`, `relation` and `privacy` are server-only: never send them to the client.
export const getProfileView = cache(async (username: string, viewerId: string | null | undefined): Promise<ProfileView | null> => {
  const record = await getProfileRecord(username);
  if (!record) return null;

  const userId = record.id;
  const privacy = privacyOf(record);
  const relation = await getRelation(viewerId, userId);

  if (canView(relation, privacy, "profile")) {
    return { access: "full", userId, relation, privacy, profile: profileForViewer(record, relation, privacy) };
  }
  const reason: RestrictedReason = relation.blocked === "byOwner" ? "unavailable"
    : relation.blocked === "byViewer" ? "blockedByViewer"
    : privacy.profileVisibility === "FOLLOWERS" ? "followers"
    : "private";
  return {
    access: "restricted",
    userId,
    relation,
    privacy,
    reason,
    profile: {
      username: record.username,
      image: reason === "unavailable" ? null : record.image,
      favColour: reason === "unavailable" ? null : record.favColour,
      staffBadge: reason === "unavailable" ? null : staffBadgeOf(record),
    },
  };
});

// The profile as a signed-out visitor (or a crawler) sees it: for metadata and the share image.
export const getPublicProfile = (username: string) => getProfileView(username, null);


// Completed books, and how many of them were finished in the given year.
export function readingCounts(books: Pick<PublicBook, "status" | "completedAt" | "timesRead">[], year = new Date().getFullYear()) {
  const completed = books.filter(isFinishedBook);
  return {
    booksRead: completed.length,
    booksThisYear: completed.filter((b) => b.completedAt && new Date(b.completedAt).getFullYear() === year).length,
  };
}

// The book they're reading now: the most recently started of their in-progress books.
export function currentBook<T extends Pick<PublicBook, "status" | "startedAt" | "createdAt">>(books: T[]): T | null {
  const time = (b: T) => new Date(b.startedAt ?? b.createdAt).getTime();
  return books.filter((b) => b.status === "STARTED").sort((a, b) => time(b) - time(a))[0] ?? null;
}

// Each achievement's highest earned rung, best first: the furthest up its ladder, then the later rung.
export function topMedals(earned: { key: string }[], limit = 3) {
  const best = new Map<string, { key: string; title: string; achievement: string; rung: number; progress: number }>();
  for (const { key } of earned) {
    const found = getMilestone(key);
    if (!found) continue;
    const { achievement, milestone } = found;
    const rung = achievement.milestones.indexOf(milestone);
    if ((best.get(achievement.key)?.rung ?? -1) >= rung) continue;
    best.set(achievement.key, {
      key: achievement.key,
      title: milestone.title,
      achievement: achievement.title,
      rung,
      progress: (rung + 1) / achievement.milestones.length,
    });
  }
  return Array.from(best.values()).sort((a, b) => b.progress - a.progress || b.rung - a.rung).slice(0, limit);
}

// Plain JSON for client components and the API: dates as ISO strings, as the API has always sent them.
export function serializeProfile(profile: PublicProfileData) {
  return JSON.parse(JSON.stringify(profile)) as Omit<PublicProfileData, "createdAt" | "books" | "achievements"> & {
    createdAt: string;
    books: (Omit<PublicBook, "createdAt" | "startedAt" | "completedAt"> & { createdAt: string; startedAt: string | null; completedAt: string | null })[];
    achievements: { key: string; earnedAt: string }[];
  };
}
export type SerializedProfile = ReturnType<typeof serializeProfile>;
