import type { CSSProperties } from "react"
import { getReaderTier } from "@bookmark/shared/readerTier"

// The tier rules live in packages/shared, so the web and mobile apps share one copy.
export * from "@bookmark/shared/readerTier"

// A thin metal ring for small avatars, where the bookmark shape is too small to read.
// Drawn with box-shadow so it adds no layout and follows whatever corner radius the avatar has.
export function tierRingStyle(booksRead: number | null | undefined): CSSProperties {
  const tier = getReaderTier(booksRead)
  if (!tier) return {}
  return { boxShadow: `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${tier.colour}` }
}
