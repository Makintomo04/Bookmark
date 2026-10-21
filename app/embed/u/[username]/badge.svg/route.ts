import { CACHE_PUBLIC, CACHE_UNAVAILABLE, coverDataUrl, getBadgeData } from '@/lib/embed'
import { parseBadgeOptions } from '@/lib/embedUrls'
import { badgeSvg, unavailableBadge } from '@/lib/embedSvg'

// The "currently reading" badge, for READMEs, personal sites and forum signatures.
// ?theme=light|dark|auto  &layout=full|compact  &show=reading|finished
export const dynamic = 'force-dynamic'

// Opened directly, an SVG is a document: forbid scripts and external loads outright.
const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors *",
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
}

export async function GET(request: Request, { params }: { params: { username: string } }) {
  const opts = parseBadgeOptions(new URL(request.url).searchParams)
  try {
    const data = await getBadgeData(params.username, opts.show)
    if (data) {
      const cover = await coverDataUrl(data.book?.coverImage)
      return new Response(badgeSvg(data, opts.layout, opts.theme, cover), { headers: { ...SVG_HEADERS, 'Cache-Control': CACHE_PUBLIC } })
    }
  } catch (err) {
    console.error('Badge failed:', err instanceof Error ? err.message : err)
  }
  return new Response(unavailableBadge(opts.layout, opts.theme), { headers: { ...SVG_HEADERS, 'Cache-Control': CACHE_UNAVAILABLE } })
}
