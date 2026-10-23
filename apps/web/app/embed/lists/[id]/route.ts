import { readableInk, shade } from '@/lib/colour'
import { CACHE_PUBLIC, CACHE_UNAVAILABLE, allowedImageUrl, clip, esc, getEmbedList, siteOrigin, type EmbedList } from '@/lib/embed'
import { listLink, parseTheme, withUtm, type EmbedTheme } from '@/lib/embedUrls'

// The list widget for iframes: covers, titles and curator notes, linking back to Bookmark.
// A route handler rather than a page, so it skips the root layout (providers, toasts, analytics)
// and ships no JavaScript at all: one small HTML document with inline CSS.
export const dynamic = 'force-dynamic'

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  // Framable anywhere; nothing else. Covers come from https hosts (or data:), styles are inline.
  'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *",
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

const BOOKMARK_PATH = 'M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z'
const MARK = `<svg width="14" height="14" viewBox="0 0 30 31" aria-hidden="true"><path d="${BOOKMARK_PATH}" fill="#F13C3C"/></svg>`

const LIGHT = '--bg:#fff;--ink:#18181b;--mut:#71717a;--line:#e4e4e7;--soft:#f4f4f5'
const DARK = '--bg:#0b0b0c;--ink:#fafafa;--mut:#a1a1aa;--line:#27272a;--soft:#18181b'

function css(theme: EmbedTheme, accent: string) {
  const accLight = readableInk(accent) === '#111111' ? shade(accent, -0.45) : accent
  const accDark = readableInk(accent) === '#ffffff' ? shade(accent, 0.45) : accent
  const light = `${LIGHT};--acc:${accLight}`
  const dark = `${DARK};--acc:${accDark}`
  const vars = theme === 'light' ? `:root{${light}}` : theme === 'dark' ? `:root{${dark};color-scheme:dark}` : `:root{${light}}@media (prefers-color-scheme:dark){:root{${dark};color-scheme:dark}}`
  return `${vars}
*{box-sizing:border-box;margin:0}
html,body{height:100%}
body{background:var(--bg);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
main{display:flex;flex-direction:column;height:100%;border:1px solid var(--line);border-radius:14px;overflow:hidden}
header{padding:16px 18px 12px;border-bottom:1px solid var(--line);border-left:4px solid ${accent}}
.eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--acc)}
h1{font-size:18px;line-height:1.25;margin-top:4px;overflow-wrap:anywhere}
h1 a:hover,.by a:hover,.more:hover{text-decoration:underline}
.by{margin-top:2px;font-size:12.5px;color:var(--mut)}
.by a{color:var(--ink);font-weight:600}
ol{list-style:none;padding:4px 0;overflow-y:auto;flex:1}
li a{display:flex;gap:12px;padding:10px 18px;align-items:flex-start}
li a:hover{background:var(--soft)}
.rank{width:18px;flex:none;padding-top:2px;font-size:12px;font-weight:700;color:var(--mut);text-align:right}
.cv{width:44px;height:66px;flex:none;border-radius:3px;object-fit:cover;background:var(--soft);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px}
.t{font-weight:600;overflow-wrap:anywhere}
.a{font-size:12.5px;color:var(--mut)}
.n{margin-top:4px;font-size:12.5px;font-style:italic;color:var(--ink);opacity:.85;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.more{display:block;padding:8px 18px 12px;font-size:12.5px;font-weight:600;color:var(--acc)}
.empty{padding:24px 18px;color:var(--mut)}
footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 18px;border-top:1px solid var(--line);font-size:12px;color:var(--mut)}
footer a{display:inline-flex;align-items:center;gap:6px}
footer b{color:var(--ink)}
.cta{font-weight:600;color:var(--acc)}`
}

function shell(title: string, body: string, theme: EmbedTheme, accent: string, head = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>${head}<base target="_blank"><style>${css(theme, accent)}</style></head><body><main>${body}</main></body></html>`
}

function itemHtml(item: EmbedList['items'][number], i: number, link: string, accent: string) {
  const src = allowedImageUrl(item.coverUrl)
  const colour = shade(accent, -0.15 - (i % 3) * 0.12)
  const cover = src
    ? `<img class="cv" src="${esc(src.toString())}" alt="" width="44" height="66" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="cv" style="background:${colour};color:${readableInk(colour)}" aria-hidden="true">${esc(Array.from(item.title.trim())[0]?.toUpperCase() ?? '')}</span>`
  return `<li><a href="${esc(link)}"><span class="rank">${i + 1}</span>${cover}<div><div class="t">${esc(clip(item.title, 120))}</div><div class="a">${esc(clip(item.author, 80))}</div>${item.note ? `<div class="n">“${esc(item.note)}”</div>` : ''}</div></a></li>`
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const theme = parseTheme(new URL(request.url).searchParams)
  let list: EmbedList | null = null
  try {
    list = await getEmbedList(params.id)
  } catch (err) {
    console.error('List widget failed:', err instanceof Error ? err.message : err)
  }

  // Private, hidden, a private curator, or no such list: all the same page.
  if (!list) {
    const home = withUtm(siteOrigin, 'list_widget', 'unavailable')
    const body = `<p class="empty">This list isn't available.</p><footer><a href="${esc(home)}">${MARK}<span>on <b>Bookmark</b></span></a></footer>`
    return new Response(shell('Not available · Bookmark', body, theme, '#F13C3C'), { status: 404, headers: { ...HTML_HEADERS, 'Cache-Control': CACHE_UNAVAILABLE } })
  }

  const link = listLink(siteOrigin, list.id, 'list_widget')
  const curator = list.curator
    ? `Curated by <a href="${esc(withUtm(`${siteOrigin}/u/${encodeURIComponent(list.curator)}`, 'list_widget', 'list'))}">${esc(list.curator)}</a>`
    : 'Curated by the Bookmark team'
  const items = list.items.length
    ? `<ol>${list.items.map((item, i) => itemHtml(item, i, link, list!.accent)).join('')}${list.itemCount > list.items.length ? `<li><a class="more" href="${esc(link)}">See all ${list.itemCount} books on Bookmark →</a></li>` : ''}</ol>`
    : `<p class="empty">No books on this list yet.</p>`
  const body = `<header><p class="eyebrow">Reading list · ${list.itemCount} ${list.itemCount === 1 ? 'book' : 'books'}</p><h1><a href="${esc(link)}">${esc(list.title)}</a></h1><p class="by">${curator}</p></header>${items}` +
    `<footer><a href="${esc(link)}">${MARK}<span>on <b>Bookmark</b></span></a><a class="cta" href="${esc(link)}">Save this list</a></footer>`
  const oembed = `<link rel="alternate" type="application/json+oembed" href="${esc(`${siteOrigin}/api/embed/oembed?url=${encodeURIComponent(`${siteOrigin}/lists/${list.id}`)}`)}" title="${esc(list.title)}">`

  return new Response(shell(`${list.title} · Bookmark`, body, theme, list.accent, oembed), { headers: { ...HTML_HEADERS, 'Cache-Control': CACHE_PUBLIC } })
}
