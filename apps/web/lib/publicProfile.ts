import { cache } from "react";
import { findUserByUsername } from "@/lib/userLookup";
import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { QUEST_MEDAL_PREFIX } from "@/lib/achievements-catalog";
import { ladders } from "@bookmark/shared/medals";
import { computeAchievementStats } from "@/lib/achievements";
import { canView, getRelation, privacyOf, privacySelect, visibleReview, type PrivacySettings, type Relation } from "@/lib/privacy";
import { isFinishedBook } from "@/lib/readerTier";
import { resolveBanner } from "@/lib/banners";
import { supporterOf, supporterSelect } from "@/lib/supporter";
import { staffBadgeOf, staffBadgeSelect, type StaffBadgeKind } from "@/lib/staffBadge";
import { workIdsWithPages } from "@/lib/workPages";

// The books a profile can show. Explicit fields so `userId` stays out of anything that leaves the
// server. Review text is loaded too, but only leaves through visibleReview() in profileForViewer().
// No blurb: a profile can carry hundreds of books, and a book's details load its blurb when opened.
const publicBookSelect = {
  id: true,
  title: true,
  author: true,
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
  // Said the way they log it: "Ch 9 of 14".
  chapters: true,
  currentChapter: true,
  logsIn: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  workKey: true,
  // Server-only: leaves as pageWorkId (pageWorkIdOf), so a book Open Library lacks still opens its details.
  workId: true,
} as const;

// A book without an Open Library key has its page (and its details) under its catalogue Work, when that
// work has one (DiscoverBook.pageWorkId), as the shelf API sends it.
function pageWorkIdOf<T extends { workKey: string | null; workId: string | null }>({ workId, ...book }: T, withPages: Set<string>) {
  return { ...book, pageWorkId: !book.workKey && workId && withPages.has(workId) ? workId : null };
}

// Everything any viewer might be shown. Server-only: profileForViewer() decides what leaves.
async function loadProfileRecord(username: string) {
  if (!username) return null;

  const user = await findUserByUsername(username, {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      profileLinks: true,
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
        select: { ...publicBookSelect, isPrivate: true, review: true, reviewSpoiler: true, reviewPrivate: true, reviewHiddenAt: true },
      },
      _count: { select: { followers: true, following: true } },
      achievements: { where: { NOT: { key: { startsWith: QUEST_MEDAL_PREFIX } } }, select: { key: true, earnedAt: true } },
      authorFollows: { orderBy: { name: "asc" }, select: { name: true, slug: true } },
      // Oldest first, as they were added; the profile shows the newest first.
      favouriteIds: true,
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
  // Set by the reader; the username shows when unset (readerName in lib/profile.ts).
  displayName: string | null;
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
type FavouriteBook = Prisma.BookGetPayload<{ select: typeof publicBookSelect & { isPrivate: true } }>;

// The reader's favourites as this viewer may see them, newest first: none when they hide them (or the
// viewer can't see the profile), and never a private book except to its reader.
async function favouritesForViewer(record: ProfileRecord, relation: Relation, privacy: PrivacySettings) {
  if (!record.favouriteIds.length || !canView(relation, privacy, "favourites")) return [] as FavouriteBook[];
  const books: FavouriteBook[] = await prisma.book.findMany({
    where: { userId: record.id, id: { in: record.favouriteIds } },
    select: { ...publicBookSelect, isPrivate: true },
  });
  const byId = new Map(books.map((b) => [b.id, b]));
  return record.favouriteIds.slice().reverse()
    .flatMap((id) => { const b = byId.get(id); return b ? [b] : []; })
    .filter((b) => !b.isPrivate || relation.isSelf)
    .map(({ isPrivate, ...book }) => ({ ...book, isPrivate: !!isPrivate }));
}

function profileForViewer(record: ProfileRecord, relation: Relation, privacy: PrivacySettings, favourites: Awaited<ReturnType<typeof favouritesForViewer>> = [], withPages: Set<string> = new Set()) {
  const showWantToRead = canView(relation, privacy, "wantToRead");
  const showCounts = canView(relation, privacy, "followCounts");
  const books = record.books
    // Private books are the owner's alone: they see them on their own profile, marked, and nobody else does.
    .filter((b) => !b.isPrivate || relation.isSelf)
    .filter((b) => b.status !== "NOT_STARTED" || showWantToRead)
    .map(({ review, reviewSpoiler, reviewPrivate, reviewHiddenAt, isPrivate, ...book }) => ({
      ...pageWorkIdOf(book, withPages),
      isPrivate: !!isPrivate,
      ...visibleReview({ review, reviewSpoiler, reviewPrivate, reviewHiddenAt }, relation, privacy),
    }));
  return {
    username: record.username,
    displayName: record.displayName,
    bio: record.bio,
    // Shown like the bio, to whoever can see the profile.
    profileLinks: record.profileLinks ?? [],
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
    // Newest first. Empty when hidden from this viewer.
    favourites: favourites.map((book) => pageWorkIdOf(book, withPages)),
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
    const favourites = await favouritesForViewer(record, relation, privacy);
    const withPages = await workIdsWithPages([...record.books, ...favourites].map((b) => (b.workKey ? null : b.workId)));
    return { access: "full", userId, relation, privacy, profile: profileForViewer(record, relation, privacy, favourites, withPages) };
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
      displayName: record.displayName,
      image: reason === "unavailable" ? null : record.image,
      favColour: reason === "unavailable" ? null : record.favColour,
      staffBadge: reason === "unavailable" ? null : staffBadgeOf(record),
    },
  };
});

// The profile as a signed-out visitor (or a crawler) sees it: for metadata and the share image.
export const getPublicProfile = (username: string) => getProfileView(username, null);

// A reader's tier and medals (/u/<username>/achievements and its API), behind the same privacy as their
// profile: a restricted profile comes back restricted, with nothing about their reading. Someone else
// gets the rungs earned and the books on their shelf, never the ladders' real numbers, which can count
// private books, reviews and goals. The owner gets the real numbers, read without awarding anything.
export async function getAchievementsView(username: string, viewerId: string | null | undefined) {
  const view = await getProfileView(username, viewerId);
  if (!view || view.access === "restricted") return view;
  const { profile, relation } = view;
  const stats = relation.isSelf ? await computeAchievementStats(view.userId) : null;
  return {
    ...view,
    achievements: {
      username: profile.username,
      displayName: profile.displayName,
      staffBadge: profile.staffBadge,
      // The shelf's count, as their profile and tier frame show it: private books aren't in it.
      booksRead: readingCounts(profile.books).booksRead,
      ladders: ladders(profile.achievements, stats),
    },
  };
}
export type PublicAchievements = NonNullable<Extract<Awaited<ReturnType<typeof getAchievementsView>>, { access: "full" }>>["achievements"];


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

// The top three medals live in packages/shared so the mobile profile picks the same ones.
export { topMedals } from "@bookmark/shared/medals";

// Plain JSON for client components and the API: dates as ISO strings, as the API has always sent them.
export function serializeProfile(profile: PublicProfileData) {
  type Dated<T> = Omit<T, "createdAt" | "startedAt" | "completedAt"> & { createdAt: string; startedAt: string | null; completedAt: string | null };
  return JSON.parse(JSON.stringify(profile)) as Omit<PublicProfileData, "createdAt" | "books" | "achievements" | "favourites"> & {
    createdAt: string;
    books: Dated<PublicBook>[];
    favourites: Dated<PublicProfileData["favourites"][number]>[];
    achievements: { key: string; earnedAt: string }[];
  };
}
export type SerializedProfile = ReturnType<typeof serializeProfile>;
