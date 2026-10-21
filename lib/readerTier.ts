import type { CSSProperties } from "react"

// A reader's tier is set by books completed, and each threshold is also a
// Books read milestone, so a new frame always lands with a milestone.
export interface ReaderTier {
  key: "bronze" | "silver" | "gold" | "platinum" | "diamond"
  label: string
  minBooks: number
  // Highlight, body and shadow of the metal, light to dark.
  light: string
  colour: string
  shade: string
  // Gold and above get a band of light sweeping across the frame.
  shimmer: boolean
}

export const READER_TIERS: ReaderTier[] = [
  { key: "bronze", label: "Bronze", minBooks: 10, light: "#E2B07C", colour: "#B07A45", shade: "#6E4220", shimmer: false },
  { key: "silver", label: "Silver", minBooks: 50, light: "#F4F6F8", colour: "#B9C1C9", shade: "#6F7880", shimmer: false },
  { key: "gold", label: "Gold", minBooks: 100, light: "#FBE39A", colour: "#E0AE34", shade: "#8F6410", shimmer: true },
  { key: "platinum", label: "Platinum", minBooks: 250, light: "#FFFDF8", colour: "#E4DACB", shade: "#8C8170", shimmer: true },
  { key: "diamond", label: "Diamond", minBooks: 500, light: "#FFFFFF", colour: "#8FDDF4", shade: "#7B61D8", shimmer: true },
]

export function getReaderTier(booksRead: number | null | undefined): ReaderTier | null {
  const n = booksRead ?? 0
  return [...READER_TIERS].reverse().find((t) => n >= t.minBooks) ?? null
}

// Prisma select fragment: completed books, for working out a user's tier.
export const booksReadCount = { _count: { select: { books: { where: { status: "COMPLETED" as const } } } } }

export function booksReadOf(user: { _count?: { books?: number } } | null | undefined) {
  return user?._count?.books ?? 0
}

// A thin metal ring for small avatars, where the bookmark shape is too small to read.
// Drawn with box-shadow so it adds no layout and follows whatever corner radius the avatar has.
export function tierRingStyle(booksRead: number | null | undefined): CSSProperties {
  const tier = getReaderTier(booksRead)
  if (!tier) return {}
  return { boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${tier.colour}` }
}
