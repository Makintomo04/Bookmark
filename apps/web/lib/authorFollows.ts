import prisma from "@/lib/db"
import type { Author } from "@/lib/authors"

// Readers following authors. Free for everyone, never gated. An author page without an Open Library key
// (no record matched the name) can't be followed: there's nothing stable to hang the follow on.

export interface FollowedAuthor {
  key: string
  name: string
  slug: string
  followedAt: string
}

export const canFollow = (author: Author): author is Author & { key: string } => !!author.key

export async function isFollowingAuthor(userId: string, authorKey: string | null) {
  if (!authorKey) return false
  const row = await prisma.authorFollow.findUnique({ where: { userId_authorKey: { userId, authorKey } }, select: { id: true } })
  return !!row
}

// Following and unfollowing set the state rather than toggle it, so a retried request can't undo itself.
export async function setFollowingAuthor(userId: string, author: Author & { key: string }, following: boolean) {
  if (following) {
    await prisma.authorFollow.upsert({
      where: { userId_authorKey: { userId, authorKey: author.key } },
      create: { userId, authorKey: author.key, name: author.name, slug: author.slug },
      // Keeps the name current if Open Library's spelling changed since.
      update: { name: author.name, slug: author.slug },
    })
  } else {
    await prisma.authorFollow.deleteMany({ where: { userId, authorKey: author.key } })
  }
}

// The reader's followed authors, A to Z.
export async function followedAuthors(userId: string): Promise<FollowedAuthor[]> {
  const rows = await prisma.authorFollow.findMany({
    where: { userId },
    select: { authorKey: true, name: true, slug: true, createdAt: true },
    orderBy: { name: "asc" },
  })
  return rows.map((r) => ({ key: r.authorKey, name: r.name, slug: r.slug, followedAt: r.createdAt.toISOString() }))
}
