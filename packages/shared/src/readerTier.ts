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

// How far a reader is from their next tier: `progress` runs 0-1 from the current tier's threshold (or 0)
// to the next one's. `next` is null once they're at the top.
export function tierProgress(booksRead: number | null | undefined) {
  const n = booksRead ?? 0
  const tier = getReaderTier(n)
  const next = READER_TIERS.find((t) => n < t.minBooks) ?? null
  if (!next) return { tier, next, remaining: 0, progress: 1 }
  const from = tier?.minBooks ?? 0
  return { tier, next, remaining: next.minBooks - n, progress: (n - from) / (next.minBooks - from) }
}

// A book counts as read once it has been finished, including while it's being re-read (its status is
// STARTED again then, but timesRead keeps the earlier finish).
export const finishedBookWhere = { OR: [{ status: "COMPLETED" as const }, { timesRead: { gte: 1 } }] }

// The same rule for books already loaded.
export function isFinishedBook(book: { status: string; timesRead?: number | null }) {
  return book.status === "COMPLETED" || (book.timesRead ?? 0) >= 1
}

// Prisma select fragment: finished books, for working out a user's tier.
export const booksReadCount = { _count: { select: { books: { where: finishedBookWhere } } } }

export function booksReadOf(user: { _count?: { books?: number } } | null | undefined) {
  return user?._count?.books ?? 0
}
