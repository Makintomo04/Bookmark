import { CACHE_PUBLIC, CACHE_UNAVAILABLE, coverDataUrl, getEmbedList } from '@/lib/embed'
import { LIST_CARD_SIZE, parseTheme } from '@/lib/embedUrls'
import { listCardSvg, unavailableSvg } from '@/lib/embedSvg'

// A list as an image: the fallback where iframes aren't allowed (READMEs, forums, most site builders).
export const dynamic = 'force-dynamic'

const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors *",
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const theme = parseTheme(new URL(request.url).searchParams)
  try {
    const list = await getEmbedList(params.id)
    if (list) {
      const covers = await Promise.all(list.items.slice(0, 6).map((item) => coverDataUrl(item.coverUrl)))
      return new Response(listCardSvg(list, theme, covers), { headers: { ...SVG_HEADERS, 'Cache-Control': CACHE_PUBLIC } })
    }
  } catch (err) {
    console.error('List card failed:', err instanceof Error ? err.message : err)
  }
  return new Response(unavailableSvg(LIST_CARD_SIZE.width, LIST_CARD_SIZE.height, theme), { headers: { ...SVG_HEADERS, 'Cache-Control': CACHE_UNAVAILABLE } })
}
