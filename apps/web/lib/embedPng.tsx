import { ImageResponse } from 'next/og'
import { readableInk, shade } from '@/lib/colour'
import { BADGE_SIZE, LIST_CARD_SIZE, type BadgeLayout, type EmbedTheme } from '@/lib/embedUrls'
import { BRAND, clip, coverDataUrl, type BadgeData, type EmbedList } from '@/lib/embed'

// PNG twins of the SVG embeds (lib/embedSvg.ts), for forums and sites that won't show an SVG.
// Rendered at 2x for sharp text on high-density screens; snippets set the 1x width and height.
// A PNG can't follow the viewer's colour scheme, so "auto" renders light.

const SCALE = 2
const PNG_TYPES = ['image/png', 'image/jpeg', 'image/gif']
const BOOKMARK_PATH = 'M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z'

const LIGHT = { bg: '#FFFFFF', ink: '#18181B', muted: '#71717A', track: '#E4E4E7', border: '#E4E4E7' }
const DARK = { bg: '#0B0B0C', ink: '#FAFAFA', muted: '#A1A1AA', track: '#27272A', border: '#2A2A2E' }

function colours(theme: EmbedTheme, accent: string) {
  const dark = theme === 'dark'
  const p = dark ? DARK : LIGHT
  const accentText = dark
    ? (readableInk(accent) === '#ffffff' ? shade(accent, 0.45) : accent)
    : (readableInk(accent) === '#111111' ? shade(accent, -0.45) : accent)
  return { ...p, accentText }
}

// Inter, subset to the text drawn. Google serves TTF (which Satori needs) to clients that don't ask for WOFF2.
async function interFont(weight: 400 | 700, text: string) {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(3000) }).then((r) => r.text())
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    if (!src) return null
    const data = await fetch(src, { signal: AbortSignal.timeout(3000) }).then((r) => r.arrayBuffer())
    return { name: 'Inter', data, weight, style: 'normal' as const }
  } catch {
    return null
  }
}

async function render(node: JSX.Element, width: number, height: number, text: string, headers: Record<string, string>) {
  const fonts = (await Promise.all([interFont(400, text), interFont(700, text)])).filter((f): f is NonNullable<typeof f> => !!f)
  return new ImageResponse(node, { width: width * SCALE, height: height * SCALE, fonts: fonts.length ? fonts : undefined, headers })
}

const px = (n: number) => n * SCALE

function Mark({ size }: { size: number }) {
  return <svg width={px(size)} height={px(size)} viewBox="0 0 30 31"><path d={BOOKMARK_PATH} fill={BRAND} /></svg>
}

function Cover({ src, w, h, colour, title }: { src: string | null; w: number; h: number; colour: string; title: string }) {
  return (
    <div style={{ display: 'flex', width: px(w), height: px(h), borderRadius: px(3), overflow: 'hidden', background: colour, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {src
        ? <img src={src} width={px(w)} height={px(h)} style={{ objectFit: 'cover' }} alt="" />
        : <span style={{ fontSize: px(w * 0.42), fontWeight: 700, color: readableInk(colour) }}>{Array.from(title.trim())[0]?.toUpperCase() ?? ''}</span>}
    </div>
  )
}

function Progress({ value, accent, track, ink, height, size }: { value: number; accent: string; track: string; ink: string; height: number; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: px(8) }}>
      <div style={{ display: 'flex', flex: 1, height: px(height), borderRadius: px(height), background: track }}>
        <div style={{ display: 'flex', width: `${value}%`, height: '100%', borderRadius: px(height), background: accent }} />
      </div>
      <span style={{ fontSize: px(size), fontWeight: 700, color: ink }}>{`${value}%`}</span>
    </div>
  )
}

export async function badgePng(data: BadgeData, layout: BadgeLayout, theme: EmbedTheme, headers: Record<string, string>) {
  const { width, height } = BADGE_SIZE[layout]
  const { book, tier, accent, username } = data
  const c = colours(theme, accent)
  const cover = await coverDataUrl(book?.coverImage, PNG_TYPES)
  const coverColour = book?.cardColour && /^#[0-9a-f]{6}$/i.test(book.cardColour) ? book.cardColour : accent
  const heading = data.show === 'finished' ? 'LAST FINISHED' : 'CURRENTLY READING'
  const empty = data.show === 'finished' ? 'Nothing finished yet' : 'Between books'
  const full = layout === 'full'
  const title = book ? clip(book.title, full ? 34 : 32) : empty
  const author = book ? clip(book.author, 44) : ''
  const name = clip(username, 22)
  const pill = tier ? `${tier.label} reader` : ''
  const finished = book?.completedAt
    ? `Finished ${book.completedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
    : 'Finished'
  const text = [heading, title, author, name, ' on Bookmark', pill, finished, '0123456789%·'].join('')

  const border = tier
    ? { background: `linear-gradient(135deg, ${tier.light}, ${tier.colour} 45%, ${tier.shade})`, padding: px(2.5) }
    : { background: c.border, padding: px(1) }

  const node = (
    <div style={{ display: 'flex', width: '100%', height: '100%', borderRadius: px(full ? 14 : 10), ...border, fontFamily: 'Inter' }}>
      <div style={{ display: 'flex', flex: 1, borderRadius: px(full ? 12 : 8), background: c.bg, padding: full ? `${px(18)}px ${px(20)}px` : `${px(7)}px ${px(12)}px`, gap: px(full ? 18 : 10), alignItems: full ? 'flex-start' : 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: px(full ? 22 : 14), bottom: px(full ? 22 : 14), width: px(4), borderRadius: px(2), background: accent, display: 'flex' }} />
        {book && <Cover src={cover} w={full ? 72 : 32} h={full ? 108 : 48} colour={coverColour} title={book.title} />}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%', justifyContent: full ? 'space-between' : 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: px(full ? 10.5 : 9.5), fontWeight: 700, letterSpacing: px(1.2), color: c.accentText }}>{heading}</span>
              {!full && <Mark size={11} />}
            </div>
            <span style={{ marginTop: px(full ? 8 : 3), fontSize: px(full ? 16 : 13), fontWeight: 700, color: c.ink }}>{title}</span>
            {book && (full || book.progress === null) && <span style={{ marginTop: px(3), fontSize: px(full ? 13 : 11), color: c.muted }}>{author}</span>}
            {book && book.progress !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: px(full ? 10 : 4) }}>
                <Progress value={book.progress} accent={accent} track={c.track} ink={c.ink} height={full ? 6 : 4} size={full ? 12 : 11} />
              </div>
            )}
            {book && full && data.show === 'finished' && <span style={{ marginTop: px(8), fontSize: px(12), color: c.muted }}>{finished}</span>}
          </div>
          {full && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: px(6), fontSize: px(12) }}>
                <Mark size={12} />
                <span style={{ fontWeight: 700, color: c.ink }}>{name}</span>
                <span style={{ color: c.muted }}>on Bookmark</span>
              </div>
              {tier && (
                <span style={{ fontSize: px(10.5), fontWeight: 700, color: '#111111', padding: `${px(2)}px ${px(8)}px`, borderRadius: px(9), background: `linear-gradient(135deg, ${tier.light}, ${tier.colour})` }}>{pill}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
  return render(node, width, height, text, headers)
}

export async function listCardPng(list: EmbedList, theme: EmbedTheme, headers: Record<string, string>) {
  const { width, height } = LIST_CARD_SIZE
  const c = colours(theme, list.accent)
  const shown = list.items.slice(0, 6)
  const covers = await Promise.all(shown.map((item) => coverDataUrl(item.coverUrl, PNG_TYPES)))
  const heading = `READING LIST · ${list.itemCount} ${list.itemCount === 1 ? 'BOOK' : 'BOOKS'}`
  const title = clip(list.title, 42)
  const curator = clip(list.curator ? `Curated by ${list.curator}` : 'Curated by the Bookmark team', 40)
  const more = list.itemCount > 6 ? `+${list.itemCount - 5}` : ''
  const text = [heading, title, curator, ' on Bookmark', more, ...shown.map((i) => i.title.slice(0, 1).toUpperCase()), 'No books on this list yet.'].join('')

  const node = (
    <div style={{ display: 'flex', width: '100%', height: '100%', borderRadius: px(14), background: c.border, padding: px(1), fontFamily: 'Inter' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderRadius: px(13), background: c.bg, padding: `${px(20)}px ${px(22)}px` }}>
        <span style={{ fontSize: px(10.5), fontWeight: 700, letterSpacing: px(1.2), color: c.accentText }}>{heading}</span>
        <span style={{ marginTop: px(6), fontSize: px(17), fontWeight: 700, color: c.ink }}>{title}</span>
        <div style={{ display: 'flex', gap: px(10), marginTop: px(12), height: px(90) }}>
          {shown.length === 0 && <span style={{ fontSize: px(13), color: c.muted, alignSelf: 'center' }}>No books on this list yet.</span>}
          {shown.map((item, i) => (
            more && i === 5
              ? <div key={i} style={{ display: 'flex', width: px(60), height: px(90), borderRadius: px(3), background: c.track, alignItems: 'center', justifyContent: 'center', fontSize: px(14), fontWeight: 700, color: c.ink }}>{more}</div>
              : <Cover key={i} src={covers[i]} w={60} h={90} colour={shade(list.accent, -0.15 - (i % 3) * 0.12)} title={item.title} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: px(6), marginTop: 'auto', fontSize: px(12) }}>
          <Mark size={12} />
          <span style={{ color: c.muted }}>{`${curator} on`}</span>
          <span style={{ fontWeight: 700, color: c.ink }}>Bookmark</span>
        </div>
      </div>
    </div>
  )
  return render(node, width, height, text, headers)
}

export async function unavailablePng(width: number, height: number, theme: EmbedTheme, headers: Record<string, string>) {
  const c = colours(theme, BRAND)
  const node = (
    <div style={{ display: 'flex', width: '100%', height: '100%', borderRadius: px(height > 80 ? 14 : 10), background: c.border, padding: px(1), fontFamily: 'Inter' }}>
      <div style={{ display: 'flex', flex: 1, borderRadius: px(height > 80 ? 13 : 9), background: c.bg, alignItems: 'center', gap: px(10), padding: `0 ${px(20)}px`, fontSize: px(13) }}>
        <Mark size={18} />
        <span style={{ fontWeight: 700, color: c.ink }}>Bookmark</span>
        <span style={{ color: c.muted }}>· not available</span>
      </div>
    </div>
  )
  return render(node, width, height, 'Bookmark· not available', headers)
}
