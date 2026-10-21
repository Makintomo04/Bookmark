import prisma from "@/lib/db"
import { ANONYMOUS, canView, privacyOf, privacySelect } from "@/lib/privacy"
import { currentBook } from "@/lib/publicProfile"
import { booksReadCount, booksReadOf, getReaderTier, type ReaderTier } from "@/lib/readerTier"
import { toHex } from "@/lib/colour"
import type { BadgeShow } from "@/lib/embedUrls"
import { BRAND, allowedImageUrl } from "@/lib/embedSafe"
import { siteUrl } from "@/lib/siteUrl";

export * from "@/lib/embedSafe"

// Server-only data for the embeds (/embed/*). Embeds are seen by anyone, anywhere, so every check is
// the signed-out one: a profile must be PUBLIC and a list PUBLIC and not hidden. Anything else comes back
// as null, and callers render the same neutral "not available" response for it as for a missing one,
// so an embed never reveals whether a private account or list exists.

// Not the request's Host header, which the client controls.
export const siteOrigin = siteUrl

// 30 minutes at the CDN (and GitHub's camo proxy), then served stale for up to an hour while it refreshes.
export const CACHE_PUBLIC = "public, max-age=1800, s-maxage=1800, stale-while-revalidate=3600"
// "Not available" is the same for a private profile and a missing one, and short, so going public shows up soon.
export const CACHE_UNAVAILABLE = "public, max-age=300, s-maxage=300"

export interface BadgeBook {
  title: string
  author: string
  coverImage: string | null
  cardColour: string | null
  // 0-100, or null when the page count is unknown.
  progress: number | null
  completedAt: Date | null
  rating: number | null
}

export interface BadgeData {
  username: string
  accent: string
  tier: ReaderTier | null
  show: BadgeShow
  // null when they're between books, or haven't finished one yet.
  book: BadgeBook | null
}

const bookSelect = {
  status: true,
  title: true,
  author: true,
  coverImage: true,
  cardColour: true,
  pages: true,
  currentPage: true,
  startedAt: true,
  createdAt: true,
  completedAt: true,
  rating: true,
} as const

export async function getBadgeData(username: string, show: BadgeShow): Promise<BadgeData | null> {
  if (!username || username.length > 64) return null
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, favColour: true, ...privacySelect, ...booksReadCount },
  })
  if (!user?.username || !canView(ANONYMOUS, privacyOf(user), "profile")) return null

  // Only Reading and Finished books are ever shown, so the Want to read shelf (and hideWantToRead) can't leak.
  const book = show === "reading"
    ? currentBook(await prisma.book.findMany({ where: { userId: user.id, status: "STARTED" }, select: bookSelect, take: 50 }))
    : await prisma.book.findFirst({ where: { userId: user.id, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: bookSelect })

  return {
    username: user.username,
    accent: toHex(user.favColour ?? "") ?? BRAND,
    tier: getReaderTier(booksReadOf(user)),
    show,
    book: book && {
      title: book.title,
      author: book.author,
      coverImage: book.coverImage || null,
      cardColour: book.cardColour,
      progress: show === "reading" && book.pages > 0
        ? Math.max(0, Math.min(100, Math.round(((book.currentPage ?? 0) / book.pages) * 100)))
        : null,
      completedAt: book.completedAt,
      rating: book.rating,
    },
  }
}

export const LIST_EMBED_ITEMS = 12

export async function getEmbedList(id: string) {
  if (!/^[0-9a-f]{24}$/i.test(id)) return null
  const list = await prisma.list.findFirst({
    where: { id, visibility: "PUBLIC", hidden: false },
    select: {
      id: true,
      title: true,
      description: true,
      isPick: true,
      owner: { select: { username: true, favColour: true, ...privacySelect } },
      items: { orderBy: { position: "asc" }, take: LIST_EMBED_ITEMS, select: { title: true, author: true, coverUrl: true, note: true } },
      _count: { select: { items: true } },
    },
  })
  if (!list?.owner.username) return null
  // A reader's list is part of their profile, so it needs a public profile too. Picks are the team's.
  if (!list.isPick && !canView(ANONYMOUS, privacyOf(list.owner), "profile")) return null
  return {
    id: list.id,
    title: list.title,
    description: list.description,
    isPick: list.isPick,
    curator: list.isPick ? null : list.owner.username,
    accent: toHex(list.owner.favColour ?? "") ?? BRAND,
    items: list.items,
    itemCount: list._count.items,
  }
}

export type EmbedList = NonNullable<Awaited<ReturnType<typeof getEmbedList>>>

// Big covers are skipped (the book colour shows instead) to keep badges light.
const MAX_COVER_BYTES = 400_000

// `types` narrows what's accepted: Satori (the PNGs) decodes only PNG, JPEG and GIF.
export async function coverDataUrl(url: string | null | undefined, types = ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
  const target = allowedImageUrl(url)
  if (!target) return null
  try {
    // Redirects are followed: Open Library covers redirect to archive.org storage. Only allowlisted hosts start one.
    const res = await fetch(target, { signal: AbortSignal.timeout(3000) })
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? ""
    if (!res.ok || !types.includes(type)) return null
    if (Number(res.headers.get("content-length") ?? 0) > MAX_COVER_BYTES) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    // Open Library answers unknown ids with a 1x1 gif.
    if (bytes.byteLength > MAX_COVER_BYTES || bytes.byteLength < 1000) return null
    return `data:${type};base64,${bytes.toString("base64")}`
  } catch {
    return null
  }
}

