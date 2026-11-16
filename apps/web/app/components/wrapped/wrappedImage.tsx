import { ImageResponse } from 'next/og'
import type { WrappedData } from '@/lib/stats'
import { readableInk, shade, toHex } from '@/lib/colour'
import { MONTHS } from './copy'
import { siteUrl } from '@/lib/siteUrl'
import { starClip } from '@bookmark/shared/rating'
import { shareImageData } from '@/lib/shareImages'

// Wrapped share images, in the reader card's visual language (app/(main)/u/[username]/opengraph-image.tsx):
// the near-black ground with the reader's colour glowing from a corner, the accent rule, Inter, and the
// red bookmark. Two formats: the 1200×630 link preview and a 1080×1920 story for Instagram and friends.
// Node runtime, since Prisma doesn't run on the edge.

export const BRAND = '#F13C3C'
export const BG = '#0B0B0C'
export const INK = '#FAFAFA'
export const MUTED = '#A1A1AA'
const BOOKMARK_PATH = 'M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z'
export const STAR_PATH = 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z'

// Covers are fetched as the other share images fetch them (lib/shareImages.ts): only from the hosts we serve
// images from, with a timeout, and only kinds Satori can draw.
export const imageData = shareImageData

export const siteHost = new URL(siteUrl).host

// A whole Google font, Inter or Literata for a card's title, fetched once and shared by every image this
// server draws. It used to be subset to each image's words, which meant eight Google requests per image that
// nothing could reuse; under load some of them timed out, the image fell back to another font, and a character
// no font had made next/og throw. Kept in Next's data cache too (about 300 KB a weight), so a new server
// instance doesn't fetch it again. A failed fetch isn't kept, so the next image tries again.
const FONT_CACHE_SECONDS = 30 * 24 * 3600
const fontCache = new Map<string, Promise<ArrayBuffer | null>>()

async function fontData(family: 'Inter' | 'Literata', weight: 400 | 600 | 700 | 800) {
  try {
    const cache = { next: { revalidate: FONT_CACHE_SECONDS } }
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`, { signal: AbortSignal.timeout(5000), ...cache }).then((r) => r.text())
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    if (!src) return null
    const res = await fetch(src, { signal: AbortSignal.timeout(5000), ...cache })
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

export async function googleFont(family: 'Inter' | 'Literata', weight: 400 | 600 | 700 | 800) {
  const key = `${family}:${weight}`
  let loading = fontCache.get(key)
  if (!loading) {
    loading = fontData(family, weight).then((data) => {
      if (!data) fontCache.delete(key)
      return data
    })
    fontCache.set(key, loading)
  }
  const data = await loading
  return data ? { name: family, data, weight, style: 'normal' as const } : null
}

const interFont = (weight: 400 | 600 | 800) => googleFont('Inter', weight)

export const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)
export const fmt = (n: number) => n.toLocaleString('en-GB')
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface ImageInput {
  wrapped: WrappedData
  username: string
  // Shown in place of the username when set; the address stays the username.
  displayName?: string | null
  favColour: string | null
  // Leave the stars off the favourite (?ratings=hide), for readers who'd rather not post them.
  hideRatings?: boolean
}

// ?ratings=hide on a story or monthly card URL.
export const hidesRatings = (url: string) => new URL(url).searchParams.get('ratings') === 'hide'

// Everything both formats print, worked out once.
function facts({ wrapped: w, username, displayName, favColour }: ImageInput) {
  const accent = toHex(favColour ?? '') ?? BRAND
  // The accent also sets text on the dark ground; lift dark accents so they stay legible.
  const accentText = readableInk(accent) === '#ffffff' ? shade(accent, 0.45) : accent
  const favourite = w.topRated ?? w.longestBook
  // A month's card (free for everyone): the month is the headline and the period is "month", not "year".
  const monthly = w.month !== null
  const goalName = monthly ? 'monthly goal' : 'goal'
  const goal = w.goal ? (w.goal.met ? `${monthly ? 'Monthly goal' : 'Goal'} met: ${fmt(w.goal.completed)} of ${fmt(w.goal.target)}` : `${fmt(w.goal.completed)} of ${fmt(w.goal.target)} ${goalName}`) : null
  const name = clip(displayName || username, 22)
  const handle = clip(username, 22)
  return {
    accent,
    accentText,
    name,
    monthly,
    // Big, in the accent: the year, or the month's name.
    headline: monthly ? MONTHS[w.month!] : String(w.year),
    // Beside the logo or above the title: "2026 Wrapped", or "October 2026".
    kicker: monthly ? `${MONTHS[w.month!]} ${w.year}` : `${w.year} Wrapped`,
    title: monthly ? `${name}’s month in books` : `${name}’s year in books`,
    // The link preview's address (wrappedOgImage). There's no public page for a month, so it points at the profile.
    url: monthly ? `${siteHost}/u/${handle}` : `${siteHost}/u/${handle}/wrapped/${w.year}`,
    // The story's sign-off: who posted it, on one line.
    signoff: `@${handle} on Bookmark`,
    favourite,
    favouriteTitle: favourite ? clip(favourite.title, 44) : '',
    favouriteAuthor: favourite ? clip(favourite.author, 34) : '',
    favouriteKicker: w.topRated ? (monthly ? 'Favourite of the month' : 'Favourite of the year') : 'The big one',
    stats: [
      { label: w.books === 1 ? 'book finished' : 'books finished', value: fmt(w.books) },
      { label: 'pages turned', value: fmt(w.pages) },
      // Audiobooks are counted in minutes, not pages, so they get a line of their own.
      ...(w.minutes >= 60 ? [{ label: 'hours listened', value: fmt(Math.round(w.minutes / 60)) }] : w.minutes > 0 ? [{ label: 'minutes listened', value: fmt(w.minutes) }] : []),
      ...(!monthly && w.busiestMonth ? [{ label: 'busiest month', value: MONTHS[w.busiestMonth.month] }] : []),
      // Genres are stored lower case ("fantasy"); a card shows them as a heading would.
      ...(w.topGenre ? [{ label: 'top genre', value: clip(capitalise(w.topGenre.name), 18) }] : []),
      ...(monthly && w.topAuthor ? [{ label: 'most read', value: clip(w.topAuthor.name, 18) }] : []),
    ],
    goal,
    // The story's footer strip: tier, medals and goal, each a value over a label like the stats above.
    footer: [
      ...(w.tier ? [{ key: 'tier' as const, value: w.tier.label, label: 'reader tier' }] : []),
      ...(w.medals.length ? [{ key: 'medals' as const, value: fmt(w.medals.length), label: `${w.medals.length === 1 ? 'medal' : 'medals'} ${monthly ? 'this month' : `in ${w.year}`}` }] : []),
      // A met goal says so ("10/2" reads oddly when a reader passes it); otherwise how far along.
      ...(w.goal ? [{ key: 'goal' as const, value: w.goal.met ? 'Met' : `${fmt(w.goal.completed)}/${fmt(w.goal.target)}`, label: w.goal.met ? `${goalName} of ${fmt(w.goal.target)}` : goalName }] : []),
    ],
  }
}

type FooterItem = ReturnType<typeof facts>['footer'][number]

async function assets(f: ReturnType<typeof facts>) {
  const [cover, regular, semibold, black] = await Promise.all([imageData(f.favourite?.coverImage), interFont(400), interFont(600), interFont(800)])
  const fonts = [regular, semibold, black].filter((x): x is NonNullable<typeof x> => !!x)
  return { cover, fonts }
}

export const Logo = ({ size, label }: { size: number; label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.45 }}>
    <svg width={size} height={size * 1.03} viewBox="0 0 30 31"><path d={BOOKMARK_PATH} fill={BRAND} /></svg>
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: -0.5 }}>{label}</span>
  </div>
)

const Stars = ({ rating, size, colour }: { rating: number; size: number; colour: string }) => (
  <div style={{ display: 'flex', gap: size * 0.15 }}>
    {Array.from({ length: 5 }, (_, i) => {
      const fill = Math.max(0, Math.min(1, rating - i))
      return (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <defs>
            <linearGradient id={`s${i}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset={starClip(fill)} stopColor={colour} />
              <stop offset={starClip(fill)} stopColor="#3F3F46" />
            </linearGradient>
          </defs>
          <path d={STAR_PATH} fill={`url(#s${i})`} />
        </svg>
      )
    })}
  </div>
)

// A footer item's mark: the tier as a ring in its metal (the avatar frame), a medal, or a target.
function FooterIcon({ item, tier, colour }: { item: FooterItem; tier: WrappedData['tier']; colour: string }) {
  const size = 48
  if (item.key === 'tier' && tier) {
    return (
      <div style={{ display: 'flex', width: size, height: size, borderRadius: 999, padding: 7, background: `linear-gradient(135deg, ${tier.light}, ${tier.colour} 55%, ${tier.shade})` }}>
        <div style={{ display: 'flex', flex: 1, borderRadius: 999, background: BG }} />
      </div>
    )
  }
  if (item.key === 'medals') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M7 1.5h4l2.2 6H9.2zM13 1.5h4l-2.2 6h-4z" fill={MUTED} />
        <circle cx="12" cy="15" r="7.5" fill={colour} />
        <circle cx="12" cy="15" r="4" fill="none" stroke={BG} strokeOpacity="0.35" strokeWidth="1.5" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="none" stroke={colour} strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="none" stroke={colour} strokeWidth="2" />
      <circle cx="12" cy="12" r="2.2" fill={colour} />
    </svg>
  )
}

function Cover({ src, book, accent, width }: { src: string | null; book: NonNullable<WrappedData['topRated'] | WrappedData['longestBook']>; accent: string; width: number }) {
  const height = Math.round(width * 1.5)
  const colour = toHex(book.cardColour ?? '') ?? accent
  return (
    <div style={{ display: 'flex', width, height, borderRadius: width * 0.04, overflow: 'hidden', background: colour, boxShadow: '0 24px 48px rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: src ? 0 : width * 0.1 }}>
      {src
        ? <img src={src} width={width} height={height} style={{ objectFit: 'cover' }} alt="" />
        : <span style={{ fontSize: width * 0.11, fontWeight: 800, textAlign: 'center', color: readableInk(colour) }}>{clip(book.title, 48)}</span>}
    </div>
  )
}

const ground = (accent: string) => ({
  background: BG,
  backgroundImage: `radial-gradient(circle at 0% 0%, ${accent}55 0%, ${accent}00 55%), radial-gradient(circle at 100% 100%, ${accent}33 0%, ${accent}00 45%)`,
  color: INK,
})

// ---- 1200×630 link preview ---------------------------------------------------------------------

export const OG_SIZE = { width: 1200, height: 630 }

export async function wrappedOgImage(input: ImageInput) {
  const f = facts(input)
  const { cover, fonts } = await assets(f)
  const w = input.wrapped
  const tier = w.tier

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', ...ground(f.accent), fontFamily: fonts.length ? 'Inter' : undefined, padding: '56px 64px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 12, background: f.accent, display: 'flex' }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Logo size={30} label="Bookmark" />
            <span style={{ fontSize: 22, color: MUTED, marginLeft: 8 }}>{f.url}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 30, color: f.accentText, fontWeight: 800 }}>{f.kicker}</span>
            <span style={{ fontSize: f.name.length > 14 ? 52 : 64, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>{f.title}</span>
          </div>

          <div style={{ display: 'flex', gap: 44 }}>
            {f.stats.slice(0, 3).map((s) => (
              <div key={s.label} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 52, fontWeight: 800, color: s === f.stats[0] ? f.accentText : INK, letterSpacing: -1 }}>{s.value}</span>
                <span style={{ fontSize: 22, color: MUTED }}>{s.label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center', minHeight: 40 }}>
            {tier && (
              <span style={{ fontSize: 20, fontWeight: 600, padding: '6px 14px', borderRadius: 999, color: '#111', background: `linear-gradient(135deg, ${tier.light}, ${tier.colour})` }}>{`${tier.label} reader`}</span>
            )}
            {f.goal && <span style={{ fontSize: 22, color: MUTED }}>{f.goal}</span>}
          </div>
        </div>

        {f.favourite && (
          <div style={{ display: 'flex', flexDirection: 'column', width: 280, marginLeft: 40, justifyContent: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: f.accentText, textTransform: 'uppercase', letterSpacing: 2 }}>{f.favouriteKicker}</span>
            <div style={{ display: 'flex', marginTop: 18 }}><Cover src={cover} book={f.favourite} accent={f.accent} width={230} /></div>
            <span style={{ marginTop: 18, fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{f.favouriteTitle}</span>
            <span style={{ marginTop: 4, fontSize: 18, color: MUTED }}>{f.favouriteAuthor}</span>
          </div>
        )}
      </div>
    ),
    { ...OG_SIZE, fonts: fonts.length ? fonts : undefined }
  )
}

// ---- 1080×1920 story ---------------------------------------------------------------------------

export const STORY_SIZE = { width: 1080, height: 1920 }

export async function wrappedStoryImage(input: ImageInput, headers?: Record<string, string>) {
  const f = facts(input)
  const { cover, fonts } = await assets(f)
  const w = input.wrapped
  const tier = w.tier

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', ...ground(f.accent), fontFamily: fonts.length ? 'Inter' : undefined, padding: '110px 90px 100px' }}>
        <Logo size={42} label="Bookmark" />

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 70 }}>
          <span style={{ fontSize: f.monthly ? (f.headline.length > 7 ? 130 : 170) : 220, fontWeight: 800, letterSpacing: f.monthly ? -5 : -10, lineHeight: 0.9, color: f.accentText }}>{f.headline}</span>
          {f.monthly && <span style={{ marginTop: 12, fontSize: 44, fontWeight: 600, color: MUTED }}>{String(w.year)}</span>}
          <span style={{ marginTop: 18, fontSize: f.name.length > 14 ? 60 : 72, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>{f.title}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 70, rowGap: 44 }}>
          {f.stats.map((s) => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', width: '50%', paddingRight: 24 }}>
              <span style={{ fontSize: s.value.length > 12 ? 50 : s.value.length > 6 ? 62 : 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>{s.value}</span>
              <span style={{ marginTop: 8, fontSize: 30, color: MUTED }}>{s.label}</span>
            </div>
          ))}
        </div>

        {f.favourite && (
          <div style={{ display: 'flex', marginTop: 80, gap: 44, alignItems: 'flex-end' }}>
            <Cover src={cover} book={f.favourite} accent={f.accent} width={280} />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontSize: 26, fontWeight: 600, color: f.accentText, textTransform: 'uppercase', letterSpacing: 3 }}>{f.favouriteKicker}</span>
              <span style={{ marginTop: 16, fontSize: 48, fontWeight: 800, lineHeight: 1.1 }}>{f.favouriteTitle}</span>
              <span style={{ marginTop: 8, fontSize: 30, color: MUTED }}>{f.favouriteAuthor}</span>
              {w.topRated && !input.hideRatings && <div style={{ display: 'flex', marginTop: 20 }}><Stars rating={w.topRated.rating} size={44} colour={f.accentText} /></div>}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flex: 1 }} />

        {f.footer.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 16, alignSelf: 'flex-start', maxWidth: '100%', alignItems: 'center', padding: '24px 32px 24px 28px', borderRadius: 32, background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.08)' }}>
            {f.footer.map((item, i) => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: i ? 24 : 0, paddingLeft: i ? 24 : 0, borderLeft: i ? '2px solid rgba(255,255,255,0.1)' : 'none' }}>
                <FooterIcon item={item} tier={tier} colour={f.accentText} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: item.value.length > 8 ? 34 : 40, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>{item.value}</span>
                  <span style={{ marginTop: 8, fontSize: 22, color: MUTED }}>{item.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48 }}>
          <span style={{ fontSize: 34, fontWeight: 600, whiteSpace: 'nowrap' }}>{f.signoff}</span>
        </div>
      </div>
    ),
    { ...STORY_SIZE, fonts: fonts.length ? fonts : undefined, headers }
  )
}
