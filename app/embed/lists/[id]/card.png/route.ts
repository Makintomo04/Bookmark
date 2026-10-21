import { CACHE_PUBLIC, CACHE_UNAVAILABLE, getEmbedList } from '@/lib/embed'
import { LIST_CARD_SIZE, parseTheme } from '@/lib/embedUrls'
import { listCardPng, unavailablePng } from '@/lib/embedPng'

// The PNG list card, for forums that won't show an SVG. Same privacy rules as card.svg.
export const dynamic = 'force-dynamic'

// Lowercase: ImageResponse merges these over its own (long-lived, immutable) defaults by key.
const headers = (cache: string) => ({ 'cache-control': cache, 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' })

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const theme = parseTheme(new URL(request.url).searchParams)
  try {
    const list = await getEmbedList(params.id)
    if (list) return await listCardPng(list, theme, headers(CACHE_PUBLIC))
  } catch (err) {
    console.error('List card PNG failed:', err instanceof Error ? err.message : err)
  }
  return unavailablePng(LIST_CARD_SIZE.width, LIST_CARD_SIZE.height, theme, headers(CACHE_UNAVAILABLE))
}
