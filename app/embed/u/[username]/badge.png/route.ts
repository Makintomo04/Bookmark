import { CACHE_PUBLIC, CACHE_UNAVAILABLE, getBadgeData } from '@/lib/embed'
import { BADGE_SIZE, parseBadgeOptions } from '@/lib/embedUrls'
import { badgePng, unavailablePng } from '@/lib/embedPng'

// The PNG badge, for forums that won't show an SVG. Same options and privacy rules as badge.svg.
export const dynamic = 'force-dynamic'

// Lowercase: ImageResponse merges these over its own (long-lived, immutable) defaults by key.
const headers = (cache: string) => ({ 'cache-control': cache, 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' })

export async function GET(request: Request, { params }: { params: { username: string } }) {
  const opts = parseBadgeOptions(new URL(request.url).searchParams)
  try {
    const data = await getBadgeData(params.username, opts.show)
    if (data) return await badgePng(data, opts.layout, opts.theme, headers(CACHE_PUBLIC))
  } catch (err) {
    console.error('Badge PNG failed:', err instanceof Error ? err.message : err)
  }
  const { width, height } = BADGE_SIZE[opts.layout]
  return unavailablePng(width, height, opts.theme, headers(CACHE_UNAVAILABLE))
}
