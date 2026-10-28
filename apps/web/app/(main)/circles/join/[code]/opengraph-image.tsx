import { ImageResponse } from 'next/og'
import { readerName } from '@/lib/profile'
import { loadInvite } from '@/lib/buddyReadsServer'
import { readableInk, toHex } from '@/lib/colour'
import { siteUrl } from '@/lib/siteUrl'

// What an invite link unfurls to: the book, the host, and a dot in each member's colour.
// Node runtime, since Prisma doesn't run on the edge. Follows the reader card in u/[username]/opengraph-image.tsx.
export const alt = 'An invitation to a Bookmark reading circle'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BRAND = '#F13C3C'
const BG = '#0B0B0C'
const INK = '#FAFAFA'
const MUTED = '#A1A1AA'
const BOOKMARK_PATH = 'M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z'

// Satori only draws images it can decode, and only from hosts we serve images from (never an
// arbitrary or internal address), fetched here with a timeout and passed in as data URLs.
const DRAWABLE = ['image/png', 'image/jpeg', 'image/gif']
const IMAGE_HOSTS = ['utfs.io', 'covers.openlibrary.org', 'images-na.ssl-images-amazon.com', 'images1.penguinrandomhouse.com', 'images3.penguinrandomhouse.com', 'lh3.googleusercontent.com', 'avatars.githubusercontent.com']

const siteOrigin = siteUrl
const siteHost = new URL(siteOrigin).host

function imageUrl(url: string | null | undefined) {
  if (!url) return null
  if (url.startsWith('/') && !url.startsWith('//')) return new URL(url, siteOrigin)
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && IMAGE_HOSTS.includes(parsed.hostname) ? parsed : null
  } catch {
    return null
  }
}

async function imageData(url: string | null | undefined) {
  const target = imageUrl(url)
  if (!target) return null
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(3000) })
    const type = res.headers.get('content-type')?.split(';')[0].trim() ?? ''
    if (!res.ok || !DRAWABLE.includes(type)) return null
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

async function interFont(weight: number, text: string) {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(3000) }).then((r) => r.text())
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    if (!src) return null
    const data = await fetch(src, { signal: AbortSignal.timeout(3000) }).then((r) => r.arrayBuffer())
    return { name: 'Inter', data, weight: weight as 400 | 600 | 800, style: 'normal' as const }
  } catch {
    return null
  }
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

export default async function Image({ params }: { params: { code: string } }) {
  const invite = await loadInvite(params.code)
  if (!invite) return new Response('Not found', { status: 404 })
  const { buddyRead, host, members } = invite

  const accent = toHex(host?.favColour ?? '') ?? BRAND
  const coverColour = toHex(buddyRead.cardColour ?? '') ?? accent
  const title = clip(buddyRead.title, 60)
  const author = clip(buddyRead.author, 40)
  const hostName = clip((host && readerName(host)) || 'A reader', 24)
  const others = members.length - 1
  const line = others > 0 ? `and ${others} ${others === 1 ? 'other' : 'others'} are reading together` : 'is starting a reading circle'
  const footer = `${siteHost} · Comments stay hidden until you reach them`

  const text = ['Bookmark', 'READING CIRCLE', 'Join', title, author, hostName, line, footer, hostName.slice(0, 1).toUpperCase()].join('') + '0123456789·…'
  const [cover, avatar, regular, semibold, black] = await Promise.all([
    imageData(buddyRead.coverImage),
    imageData(host?.image),
    interFont(400, text),
    interFont(600, text),
    interFont(800, text),
  ])
  const fonts = [regular, semibold, black].filter((f): f is NonNullable<typeof f> => !!f)
  const colours = members.slice(0, 15).map((m) => toHex(m.favColour ?? '') ?? BRAND)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: BG,
          backgroundImage: `radial-gradient(circle at 100% 0%, ${accent}55 0%, ${accent}00 55%)`,
          color: INK,
          fontFamily: fonts.length ? 'Inter' : undefined,
          padding: '56px 64px',
          gap: 56,
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 340,
            height: 510,
            flexShrink: 0,
            borderRadius: 14,
            overflow: 'hidden',
            background: coverColour,
            boxShadow: '0 24px 48px rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: cover ? 0 : 28,
          }}
        >
          {cover
            ? <img src={cover} width={340} height={510} style={{ objectFit: 'cover' }} alt="" />
            : <span style={{ fontSize: 38, fontWeight: 800, textAlign: 'center', color: readableInk(coverColour) }}>{title}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg width="30" height="31" viewBox="0 0 30 31"><path d={BOOKMARK_PATH} fill={BRAND} /></svg>
            <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>Bookmark</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: accent, letterSpacing: 3 }}>READING CIRCLE</span>
            <span style={{ fontSize: title.length > 30 ? 52 : 64, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05 }}>{title}</span>
            <span style={{ fontSize: 28, color: MUTED }}>{author}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ display: 'flex', width: 72, height: 72, borderRadius: 22, overflow: 'hidden', background: accent, alignItems: 'center', justifyContent: 'center' }}>
                {avatar
                  ? <img src={avatar} width={72} height={72} style={{ objectFit: 'cover' }} alt="" />
                  : <span style={{ fontSize: 36, fontWeight: 800, color: readableInk(accent) }}>{hostName.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 30, fontWeight: 600 }}>{hostName}</span>
                <span style={{ fontSize: 22, color: MUTED }}>{line}</span>
              </div>
            </div>
            {/* One dot per reader, in their colour: the shared progress track, without the progress. */}
            <div style={{ display: 'flex', gap: 10 }}>
              {colours.map((c, i) => (
                <div key={i} style={{ display: 'flex', width: 26, height: 26, borderRadius: 999, background: c, border: `3px solid ${BG}` }} />
              ))}
            </div>
            <span style={{ fontSize: 20, color: MUTED }}>{footer}</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  )
}
