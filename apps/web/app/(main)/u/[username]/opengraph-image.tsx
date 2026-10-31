import { ImageResponse } from 'next/og'
import { handleOf } from '@/lib/handle'
import { readerName } from '@/lib/profile'
import { currentBook, getPublicProfile, readingCounts, topMedals } from '@/lib/publicProfile'
import { getReaderTier } from '@/lib/readerTier'
import { readableInk, shade, toHex } from '@/lib/colour'
import { MEDAL_INK, getMedalColour } from '@/app/components/achievements/achievementTheme'
import { getAchievementIcon } from '@/app/components/achievements/achievementIcons'
import { siteUrl } from '@/lib/siteUrl'
import { shareImageData as imageData } from '@/lib/shareImages'

// The reader card: what a profile link unfurls to. Node runtime, since Prisma doesn't run on the edge.
export const alt = 'A Bookmark reader card'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BRAND = '#F13C3C'
const BG = '#0B0B0C'
const INK = '#FAFAFA'
const MUTED = '#A1A1AA'
const BOOKMARK_PATH = 'M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z'

// Covers and avatars: lib/shareImages.ts, the one list of hosts every share image fetches from.

// Inter, subset to the card's text. Google serves TTF (which Satori needs) to clients that don't ask for WOFF2.
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

// Not the request's Host header, which the client controls.
const siteOrigin = siteUrl
const siteHost = new URL(siteOrigin).host

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

// lucide icons are forwardRef components, which Satori can't call; render to their <svg> element directly.
function icon(key: string, sizePx: number) {
  const Icon = getAchievementIcon(key) as unknown as { render: (props: object, ref: null) => JSX.Element }
  return Icon.render({ size: sizePx, color: MEDAL_INK, strokeWidth: 1.75 }, null)
}

export default async function Image({ params }: { params: { username: string } }) {
  // The signed-out view: a followers-only or private profile gets no card, so its reading never unfurls.
  const data = await getPublicProfile(handleOf(params.username))
  if (!data || data.access !== 'full') return new Response('Not found', { status: 404 })

  const { profile } = data
  const year = new Date().getFullYear()
  const { booksRead, booksThisYear } = readingCounts(profile.books, year)
  const tier = getReaderTier(booksRead)
  const medals = topMedals(profile.achievements, 3)
  const reading = currentBook(profile.books)

  const accent = toHex(profile.favColour ?? '') ?? BRAND
  const coverColour = toHex(reading?.cardColour ?? '') ?? accent
  // The accent is also used as text on the dark card; lift dark accents so they stay legible.
  const accentText = readableInk(accent) === '#ffffff' ? shade(accent, 0.45) : accent

  const name = clip(readerName(profile), 22)
  const handle = profile.displayName ? clip(`@${profile.username}`, 24) : null
  const yearLine = `${booksThisYear} ${booksThisYear === 1 ? 'book' : 'books'} read in ${year}`
  const profileUrl = `${siteHost}/u/${clip(profile.username, 22)}`
  const bookTitle = reading ? clip(reading.title, 48) : ''
  const bookAuthor = reading ? clip(reading.author, 36) : ''

  const text = ['Bookmark', 'CURRENTLY READING', 'reader', name, handle ?? '', yearLine, bookTitle, bookAuthor, tier?.label ?? '', profileUrl, ...medals.flatMap((m) => [m.title, m.achievement]), readerName(profile).slice(0, 1).toUpperCase()].join('') + '0123456789·…'
  const [avatar, cover, regular, semibold, black] = await Promise.all([
    imageData(profile.image),
    imageData(reading?.coverImage),
    interFont(400, text),
    interFont(600, text),
    interFont(800, text),
  ])
  const fonts = [regular, semibold, black].filter((f): f is NonNullable<typeof f> => !!f)

  const avatarSize = 168
  const frame = tier ? 8 : 0

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: BG,
          backgroundImage: `radial-gradient(circle at 0% 0%, ${accent}55 0%, ${accent}00 55%), radial-gradient(circle at 100% 100%, ${accent}33 0%, ${accent}00 45%)`,
          color: INK,
          fontFamily: fonts.length ? 'Inter' : undefined,
          padding: '56px 64px',
        }}
      >
        {/* Accent rule down the left edge, like the profile banner. */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 12, background: accent, display: 'flex' }} />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg width="30" height="31" viewBox="0 0 30 31"><path d={BOOKMARK_PATH} fill={BRAND} /></svg>
            <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>Bookmark</span>
            <span style={{ fontSize: 22, color: MUTED, marginLeft: 8 }}>{profileUrl}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            <div
              style={{
                display: 'flex',
                width: avatarSize,
                height: avatarSize,
                padding: frame,
                borderRadius: 48,
                background: tier ? `linear-gradient(135deg, ${tier.light}, ${tier.colour} 45%, ${tier.shade})` : 'transparent',
              }}
            >
              <div style={{ display: 'flex', flex: 1, borderRadius: 48 - frame, overflow: 'hidden', background: accent, alignItems: 'center', justifyContent: 'center' }}>
                {avatar
                  ? <img src={avatar} width={avatarSize - frame * 2} height={avatarSize - frame * 2} style={{ objectFit: 'cover' }} alt="" />
                  : <span style={{ fontSize: 80, fontWeight: 800, color: readableInk(accent) }}>{readerName(profile).slice(0, 1).toUpperCase()}</span>}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: name.length > 14 ? 52 : 68, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>{name}</span>
              {handle && <span style={{ fontSize: 26, color: MUTED, marginTop: -4 }}>{handle}</span>}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 30, color: MUTED }}>
                <span style={{ color: accentText, fontWeight: 800, fontSize: 40 }}>{booksThisYear}</span>
                <span>{`${booksThisYear === 1 ? 'book' : 'books'} read in ${year}`}</span>
              </div>
              {tier && (
                <div style={{ display: 'flex', marginTop: 4 }}>
                  <span style={{ fontSize: 20, fontWeight: 600, padding: '6px 14px', borderRadius: 999, color: '#111', background: `linear-gradient(135deg, ${tier.light}, ${tier.colour})` }}>
                    {`${tier.label} reader`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 96 }}>
            <div style={{ display: 'flex', gap: 28 }}>
              {medals.map((m) => {
                const colour = getMedalColour(m.key)
                return (
                  <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', width: 64, height: 64, borderRadius: 999, background: colour, border: `4px solid ${shade(colour, -0.3)}`, alignItems: 'center', justifyContent: 'center' }}>
                      {icon(m.key, 30)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 20, fontWeight: 600 }}>{m.title}</span>
                      <span style={{ fontSize: 16, color: MUTED }}>{m.achievement}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {reading && (
          <div style={{ display: 'flex', flexDirection: 'column', width: 300, marginLeft: 40, justifyContent: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: accentText, textTransform: 'uppercase', letterSpacing: 2 }}>Currently reading</span>
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                width: 240,
                height: 360,
                borderRadius: 10,
                overflow: 'hidden',
                background: coverColour,
                boxShadow: '0 24px 48px rgba(0,0,0,0.55)',
                alignItems: 'center',
                justifyContent: 'center',
                padding: cover ? 0 : 24,
              }}
            >
              {cover
                ? <img src={cover} width={240} height={360} style={{ objectFit: 'cover' }} alt="" />
                : <span style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', color: readableInk(coverColour) }}>{bookTitle}</span>}
            </div>
            <span style={{ marginTop: 18, fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{bookTitle}</span>
            <span style={{ marginTop: 4, fontSize: 18, color: MUTED }}>{bookAuthor}</span>
          </div>
        )}
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  )
}
