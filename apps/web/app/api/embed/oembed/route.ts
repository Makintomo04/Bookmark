import { NextResponse } from 'next/server'
import { CACHE_PUBLIC, CACHE_UNAVAILABLE, getBadgeData, getEmbedList, siteOrigin } from '@/lib/embed'
import { BADGE_SIZE, DEFAULT_BADGE, LIST_WIDGET_HEIGHT, badgeUrl, listWidgetUrl } from '@/lib/embedUrls'

// oEmbed (https://oembed.com) for list and profile links, so blog platforms and link-preview services
// that support discovery can turn a pasted Bookmark link into the widget. Same privacy rules as the
// embeds themselves: anything not public is a plain 404, whether or not it exists.
export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': CACHE_UNAVAILABLE } })

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  if ((params.get('format') ?? 'json') !== 'json') return NextResponse.json({ error: 'Only JSON is supported' }, { status: 501 })

  let target: URL
  try {
    target = new URL(params.get('url') ?? '')
  } catch {
    return notFound()
  }
  if (target.origin !== siteOrigin) return notFound()
  const maxWidth = Number(params.get('maxwidth')) || 560
  const base = { version: '1.0', provider_name: 'Bookmark', provider_url: siteOrigin, cache_age: 1800 }
  const headers = { 'Cache-Control': CACHE_PUBLIC, 'Access-Control-Allow-Origin': '*' }

  try {
    const listId = target.pathname.match(/^\/lists\/([0-9a-f]{24})\/?$/i)?.[1]
    if (listId) {
      const list = await getEmbedList(listId)
      if (!list) return notFound()
      const width = Math.min(maxWidth, 560)
      const src = listWidgetUrl(siteOrigin, list.id, 'auto')
      const title = list.title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
      return NextResponse.json({
        ...base,
        type: 'rich',
        title: list.title,
        author_name: list.curator ?? 'Bookmark',
        ...(list.curator ? { author_url: `${siteOrigin}/u/${encodeURIComponent(list.curator)}` } : {}),
        width,
        height: LIST_WIDGET_HEIGHT,
        html: `<iframe src="${src}" title="${title}" width="${width}" height="${LIST_WIDGET_HEIGHT}" style="border:0" loading="lazy"></iframe>`,
      }, { headers })
    }

    const username = target.pathname.match(/^\/u\/([^/]+)\/?$/)?.[1]
    if (username) {
      const data = await getBadgeData(decodeURIComponent(username), 'reading')
      if (!data) return notFound()
      const { width, height } = BADGE_SIZE.full
      return NextResponse.json({
        ...base,
        type: 'photo',
        title: `${data.username} on Bookmark`,
        author_name: data.username,
        author_url: `${siteOrigin}/u/${encodeURIComponent(data.username)}`,
        url: badgeUrl(siteOrigin, data.username, DEFAULT_BADGE),
        width,
        height,
      }, { headers })
    }
  } catch (err) {
    console.error('oEmbed failed:', err instanceof Error ? err.message : err)
  }
  return notFound()
}
