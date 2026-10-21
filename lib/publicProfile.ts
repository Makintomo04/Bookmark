import { cache } from "react";
import prisma from "@/lib/db";
import { getMilestone } from "@/lib/achievements-catalog";

// The books a public profile shows. Explicit fields so `review` (private until reviews get a
// visibility setting) and `userId` stay out of anything that leaves the server.
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
  createdAt: true,
  startedAt: true,
  completedAt: true,
  workKey: true,
} as const;

async function loadPublicProfile(username: string) {
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
      books: {
        where: { status: { in: ["STARTED", "COMPLETED"] } },
        orderBy: { createdAt: "desc" },
        select: publicBookSelect,
      },
      _count: { select: { followers: true, following: true } },
      achievements: { select: { key: true, earnedAt: true } },
    },
  });
  if (!user?.username) return null;

  const { id, _count, ...rest } = user;
  return {
    // Server-only: used to work out the viewer's relationship to this profile. Never sent to the client.
    userId: id,
    profile: {
      ...rest,
      username: user.username,
      followerCount: _count.followers,
      followingCount: _count.following,
    },
  };
}

// One query per request however many places ask: generateMetadata, the page and the API route share it.
export const getPublicProfile = cache(loadPublicProfile);

export type PublicProfileData = NonNullable<Awaited<ReturnType<typeof loadPublicProfile>>>["profile"];
export type PublicBook = PublicProfileData["books"][number];

export const isFollowing = cache(async (followerId: string, followingId: string) => {
  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { id: true },
  });
  return !!follow;
});

// Completed books, and how many of them were finished in the given year.
export function readingCounts(books: Pick<PublicBook, "status" | "completedAt">[], year = new Date().getFullYear()) {
  const completed = books.filter((b) => b.status === "COMPLETED");
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
