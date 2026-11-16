import { after } from 'next/server'
import { ImageResponse } from 'next/og'
import type { WrapCardBook, WrapCardData } from '@bookmark/shared/statsTypes'
import { CARD_SIZES, cardStats, cardWords, gridLayout, moodMix, type CardDesign, type CardKind, type CardSize } from '@bookmark/shared/wrapCards'
import { ratingGlyphs, starClip } from '@bookmark/shared/rating'
import { readableInk, shade, toHex } from '@/lib/colour'
import { BG, BRAND, INK, MUTED, STAR_PATH, Logo, clip, fmt, googleFont, imageData } from './wrappedImage'

// Wrap cards (BOO-50): the cover grid ("My October in books") and the stats card, in 9:16, 4:5 and 1:1,
// in three designs. Same visual language as the Wrapped story (wrappedImage.tsx): Inter, the red
// bookmark, the reader's colour; the title is in Literata. Every word is fixed copy from
// packages/shared/src/wrapCards.ts or here. Private books never reach this file (lib/stats.ts
// getWrapCard leaves them out).

// lucide's Flame, the spice mark the book page uses (WorkTags.tsx SpiceFlames).
const FLAME_PATH = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'

interface CardInput {
  card: WrapCardData
  kind: CardKind
  size: CardSize
  design: CardDesign
  username: string
  favColour: string | null
  hideRatings?: boolean
}

// ---- Designs ---------------------------------------------------------------------------------

interface Palette {
  background: string
  backgroundImage?: string
  ink: string
  muted: string
  // The title and the first number.
  accent: string
  // Empty stars and bar tracks.
  track: string
  // The "+12 more" cell and hairlines.
  tile: string
  line: string
}

function palette(design: CardDesign, favColour: string | null): Palette {
  const colour = toHex(favColour ?? '') ?? BRAND
  const darkColour = readableInk(colour) === '#ffffff'
  if (design === 'paper') {
    return {
      background: '#F5F1EA',
      ink: '#171717',
      muted: '#525252',
      // Light colours darken to stay legible on paper.
      accent: darkColour ? colour : shade(colour, -0.5),
      track: '#D4D4D4',
      tile: 'rgba(0,0,0,0.05)',
      line: 'rgba(0,0,0,0.12)',
    }
  }
  if (design === 'colour') {
    const ink = readableInk(colour)
    const light = ink === '#ffffff'
    return {
      background: colour,
      backgroundImage: `linear-gradient(160deg, ${shade(colour, 0.14)} 0%, ${colour} 45%, ${shade(colour, -0.35)} 100%)`,
      ink,
      muted: light ? 'rgba(255,255,255,0.78)' : 'rgba(17,17,17,0.72)',
      accent: ink,
      track: light ? 'rgba(255,255,255,0.3)' : 'rgba(17,17,17,0.22)',
      tile: light ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,17,0.08)',
      line: light ? 'rgba(255,255,255,0.25)' : 'rgba(17,17,17,0.18)',
    }
  }
  return {
    background: BG,
    backgroundImage: `radial-gradient(circle at 0% 0%, ${colour}55 0%, ${colour}00 55%), radial-gradient(circle at 100% 100%, ${colour}33 0%, ${colour}00 45%)`,
    ink: INK,
    muted: MUTED,
    // Dark colours lift so they stay legible on near-black.
    accent: darkColour ? shade(colour, 0.45) : colour,
    track: '#404040',
    tile: 'rgba(255,255,255,0.06)',
    line: 'rgba(255,255,255,0.1)',
  }
}

// ---- Sizes -----------------------------------------------------------------------------------

const METRICS: Record<CardSize, { side: number; top: number; bottom: number; logo: number; title: number; stats: number; line: number; gap: number; coverGap: number; big: number }> = {
  story: { side: 88, top: 104, bottom: 92, logo: 38, title: 96, stats: 38, line: 30, gap: 52, coverGap: 20, big: 96 },
  portrait: { side: 72, top: 68, bottom: 60, logo: 32, title: 78, stats: 32, line: 26, gap: 34, coverGap: 16, big: 80 },
  square: { side: 64, top: 56, bottom: 52, logo: 30, title: 66, stats: 30, line: 24, gap: 26, coverGap: 14, big: 68 },
}

// Literata is about 0.55 em a character at this weight: shrink a long title to keep it on one line.
const fitTitle = (title: string, width: number, max: number) => Math.min(max, Math.floor(width / (title.length * 0.56)))

// ---- Pieces ----------------------------------------------------------------------------------

function Stars({ rating, size, colour, track, id }: { rating: number; size: number; colour: string; track: string; id: string }) {
  return (
    <div style={{ display: 'flex', gap: size * 0.12 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, rating - i))
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs>
              {/* Unique per cover: Satori shares gradient ids across the whole image. */}
              <linearGradient id={`${id}s${i}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset={starClip(fill)} stopColor={colour} />
                <stop offset={starClip(fill)} stopColor={track} />
              </linearGradient>
            </defs>
            <path d={STAR_PATH} fill={`url(#${id}s${i})`} />
          </svg>
        )
      })}
    </div>
  )
}

// A dark pill on the cover itself, legible on any cover and any design.
const Badge = ({ children, size, style }: { children: React.ReactNode; size: number; style: React.CSSProperties }) => (
  <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', gap: size * 0.2, padding: `${size * 0.18}px ${size * 0.4}px`, borderRadius: 999, background: 'rgba(0,0,0,0.74)', color: '#FAFAFA', fontSize: size, fontWeight: 800, lineHeight: 1, ...style }}>
    {children}
  </div>
)

function Cover({ book, src, width, height, p, stars, overlayRating, id }: { book: WrapCardBook; src: string | null; width: number; height: number; p: Palette; stars: boolean; overlayRating: boolean; id: string }) {
  const colour = toHex(book.cardColour ?? '') ?? '#3F3F46'
  const badge = Math.max(14, Math.min(30, Math.round(width * 0.11)))
  const starSize = Math.max(16, Math.min(30, Math.floor(width / 6.6)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width }}>
      <div style={{ display: 'flex', position: 'relative', width, height, borderRadius: Math.max(4, Math.round(width * 0.035)), overflow: 'hidden', background: colour, alignItems: 'center', justifyContent: 'center' }}>
        {src ? (
          <img src={src} width={width} height={height} style={{ objectFit: 'cover' }} alt="" />
        ) : (
          // A cover that didn't load (or never existed) becomes a tile with the title on it.
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: width * 0.09 }}>
            <span style={{ fontSize: Math.max(11, width * 0.12), fontWeight: 800, textAlign: 'center', lineHeight: 1.15, color: readableInk(colour) }}>{clip(book.title, width < 120 ? 28 : 48)}</span>
            {width >= 150 && <span style={{ marginTop: width * 0.05, fontSize: width * 0.08, textAlign: 'center', color: readableInk(colour), opacity: 0.8 }}>{clip(book.author, 30)}</span>}
          </div>
        )}
        {/* Only ever set on a book spice applies to (romance, romantasy, erotica, or flagged for sexual content):
            app/api/works/tags keeps a reader's spice nowhere else (lib/workTags.ts spiceApplies). */}
        {book.spice !== null && book.spice > 0 && width >= 64 && (
          <Badge size={badge} style={{ top: badge * 0.4, right: badge * 0.4 }}>
            <svg width={badge} height={badge} viewBox="0 0 24 24"><path d={FLAME_PATH} fill="#FB923C" /></svg>
            <span>{String(book.spice)}</span>
          </Badge>
        )}
        {overlayRating && book.rating !== null && width >= 64 && (
          <Badge size={badge} style={{ bottom: badge * 0.4, left: badge * 0.4 }}>
            <svg width={badge} height={badge} viewBox="0 0 24 24"><path d={STAR_PATH} fill="#FACC15" /></svg>
            <span>{ratingGlyphs(book.rating)}</span>
          </Badge>
        )}
      </div>
      {stars && (
        <div style={{ display: 'flex', marginTop: 10, height: starSize }}>
          {book.rating !== null && <Stars rating={book.rating} size={starSize} colour={p.accent} track={p.track} id={id} />}
        </div>
      )}
    </div>
  )
}

function Header({ m, kicker, title, titleSize, p }: { m: typeof METRICS[CardSize]; kicker: string; title: string; titleSize: number; p: Palette }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: p.ink }}>
        <Logo size={m.logo} label="Bookmark" />
        <span style={{ fontSize: m.line + 2, fontWeight: 600, color: p.muted }}>{kicker}</span>
      </div>
      <span style={{ marginTop: m.gap * 0.8, fontFamily: 'Literata', fontSize: titleSize, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1, color: p.accent }}>{title}</span>
    </div>
  )
}

function StatsLine({ stats, size, p }: { stats: { value: string; label: string }[]; size: number; p: Palette }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', marginTop: 14, fontSize: size, lineHeight: 1.25 }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'baseline' }}>
          {i > 0 && <span style={{ color: p.muted, margin: `0 ${size * 0.4}px` }}>·</span>}
          <span style={{ fontWeight: 800, color: p.ink }}>{s.value}</span>
          <span style={{ marginLeft: size * 0.25, color: p.muted }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

const MoodsLine = ({ moods, size, p }: { moods: ReturnType<typeof moodMix>; size: number; p: Palette }) => (
  <div style={{ display: 'flex', fontSize: size, lineHeight: 1.3, color: p.muted }}>
    <span style={{ fontWeight: 600, color: p.ink, marginRight: size * 0.4 }}>Moods</span>
    <span>{moods.map((m) => `${m.label} ${m.percent}%`).join(' · ')}</span>
  </div>
)

const Footer = ({ handle, size, p }: { handle: string; size: number; p: Palette }) => (
  <div style={{ display: 'flex', fontSize: size, lineHeight: 1.3 }}>
    <span style={{ fontWeight: 600, color: p.ink, whiteSpace: 'nowrap' }}>{`@${handle} on Bookmark`}</span>
  </div>
)

// ---- Assets ----------------------------------------------------------------------------------

// Open Library covers by ID come from archive.org, which takes a couple of seconds each and sometimes far
// longer, and a card waits for its slowest cover. So a card waits this long at most (all the covers are
// fetched at once); a cover that isn't back by then is drawn as its title tile, and carries on loading
// (up to COVER_TIMEOUT) so the next draw has it.
const COVER_WAIT = 3500
const COVER_TIMEOUT = 20_000
// Covers don't change, so the fetch is kept in Next's data cache, which outlives this server instance:
// a week, and then fetched again.
const COVER_CACHE_SECONDS = 7 * 24 * 3600

// Covers this server has already fetched, by URL. Picking a size or design draws the card again, and
// Open Library throttles a burst of dozens of covers, so the second draw reuses what the first got.
// Only covers that loaded are kept; an hour at most, and the oldest go first past the cap.
const coverCache = new Map<string, { data: string; at: number }>()
const CACHE_MAX = 600
const CACHE_TTL = 3600_000
// Covers being fetched, so two draws at once (or a draw after a slow cover was given up on) share one fetch.
const coverLoading = new Map<string, Promise<string | null>>()

async function cover(url: string | null) {
  if (!url) return null
  const hit = coverCache.get(url)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data
  let loading = coverLoading.get(url)
  if (!loading) {
    loading = imageData(url, COVER_TIMEOUT, COVER_CACHE_SECONDS)
      .then((data) => {
        if (data) {
          coverCache.delete(url)
          coverCache.set(url, { data, at: Date.now() })
          if (coverCache.size > CACHE_MAX) coverCache.delete(coverCache.keys().next().value!)
        }
        return data
      })
      .finally(() => coverLoading.delete(url))
    coverLoading.set(url, loading)
    // Keeps the function alive after the card is sent, so a cover given up on still lands in the caches.
    after(() => loading)
  }
  let waited: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => (waited = setTimeout(() => resolve(null), COVER_WAIT)))
  return Promise.race([loading, late]).finally(() => clearTimeout(waited))
}

// Open Library serves three sizes; small grid cells don't need the large one.
function coverFor(url: string | null, width: number) {
  if (!url || width > 240) return url
  return url.replace(/^(https:\/\/covers\.openlibrary\.org\/.+)-L\.jpg/, '$1-M.jpg')
}

async function fonts() {
  const loaded = await Promise.all([googleFont('Inter', 400), googleFont('Inter', 600), googleFont('Inter', 800), googleFont('Literata', 700)])
  return loaded.filter((x): x is NonNullable<typeof x> => !!x)
}

// ---- The cards -------------------------------------------------------------------------------

export async function wrapCardImage(input: CardInput, headers?: Record<string, string>) {
  const { card, kind, size, design, hideRatings } = input
  const { width: W, height: H } = CARD_SIZES[size]
  const m = METRICS[size]
  const p = palette(design, input.favColour)
  const handle = clip(input.username, 24)
  const contentWidth = W - m.side * 2
  const { title, kicker } = cardWords(card)
  const titleSize = fitTitle(title, contentWidth, m.title)
  // Books, not reads: a re-read in the period is one cover on the grid, so it's one book here too. The reads
  // are said beside it when they differ, as /stats counts them.
  const stats = cardStats({ books: card.books.length, reads: card.finishes, pages: card.pages, minutes: card.minutes })
  const moods = moodMix(card.moods)
  const rated = !hideRatings && card.books.some((b) => b.rating !== null)

  // Everything above and below the grid, in the same numbers the layout below uses.
  const headerHeight = m.logo * 1.2 + m.gap * 0.8 + titleSize * 1.1
  const statsHeight = 14 + m.stats * 1.25
  const moodsHeight = moods.length ? m.gap * 0.7 + m.line * 1.3 : 0
  const footerHeight = m.gap * 0.7 + m.line * 1.3

  let body: React.ReactNode
  let covers: (string | null)[] = []
  // Alongside the covers.
  const fontsLoading = fonts()

  if (kind === 'grid') {
    const box = {
      width: contentWidth,
      height: Math.floor(H - m.top - m.bottom - headerHeight - statsHeight - m.gap - moodsHeight - footerHeight - 12),
      gap: m.coverGap,
      minCover: 84,
      maxCover: Math.round(contentWidth * 0.6),
      // The stars under a cover: 10 above them, and at most 30 tall (Cover's starSize).
      labelHeight: rated ? 40 : 0,
      labelMinCover: 150,
    }
    const layout = gridLayout(card.books.length, box)
    const shown = card.books.slice(0, layout.shown)
    covers = await Promise.all(shown.map((b) => cover(coverFor(b.coverImage, layout.coverWidth))))
    const stars = rated && layout.labels
    body = (
      <div style={{ display: 'flex', flex: 1, marginTop: m.gap, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: m.coverGap, rowGap: m.coverGap, width: layout.columns * layout.coverWidth + (layout.columns - 1) * m.coverGap }}>
          {shown.map((b, i) => (
            <Cover key={b.id} id={`c${i}`} book={b} src={covers[i]} width={layout.coverWidth} height={layout.coverHeight} p={p} stars={stars} overlayRating={rated && !layout.labels} />
          ))}
          {layout.more > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: layout.coverWidth, height: layout.coverHeight, borderRadius: Math.max(4, Math.round(layout.coverWidth * 0.035)), background: p.tile, border: `2px solid ${p.line}`, color: p.ink }}>
              <span style={{ fontSize: Math.max(20, layout.coverWidth * 0.26), fontWeight: 800, letterSpacing: -1 }}>{`+${fmt(layout.more)}`}</span>
              <span style={{ fontSize: Math.max(13, layout.coverWidth * 0.13), color: p.muted }}>more</span>
            </div>
          )}
        </div>
      </div>
    )
  } else {
    body = await statsBody({ card, size, m, p, rated })
  }

  const loaded = await fontsLoading

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: p.background, ...(p.backgroundImage ? { backgroundImage: p.backgroundImage } : {}), color: p.ink, fontFamily: loaded.length ? 'Inter' : undefined, padding: `${m.top}px ${m.side}px ${m.bottom}px` }}>
        <Header m={m} kicker={kicker} title={title} titleSize={titleSize} p={p} />
        {kind === 'grid' && <StatsLine stats={stats} size={m.stats} p={p} />}
        {body}
        {moods.length > 0 && <div style={{ display: 'flex', marginTop: m.gap * 0.7 }}><MoodsLine moods={moods} size={m.line} p={p} /></div>}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: m.gap * 0.7 }}><Footer handle={handle} size={m.line} p={p} /></div>
      </div>
    ),
    { width: W, height: H, fonts: loaded.length ? loaded : undefined, headers }
  )
}

// The stats card: the big numbers, the rating spread and top genres, then a strip of covers where
// there's room.
async function statsBody({ card, size, m, p, rated }: { card: WrapCardData; size: CardSize; m: typeof METRICS[CardSize]; p: Palette; rated: boolean }) {
  const numbers = [
    ...cardStats({ books: card.books.length, reads: card.finishes, pages: card.pages, minutes: card.minutes }),
    ...(rated && card.averageRating !== null ? [{ value: `${card.averageRating.toFixed(1)}`, label: 'average rating' }] : []),
  ].slice(0, 4)
  const most = Math.max(1, ...card.ratings)
  const showRatings = rated && card.ratings.some((n) => n > 0)
  const genres = card.genres.map((g) => ({ name: clip(g.name.charAt(0).toUpperCase() + g.name.slice(1), 18), count: g.count }))
  // Covers along the bottom where there's room: two rows of six on a story, one row on a 4:5 post.
  const perRow = size === 'square' ? 0 : 6
  const stripBooks = card.books.slice(0, size === 'story' ? perRow * 2 : perRow)
  const stripWidth = stripBooks.length ? Math.floor((CARD_SIZES[size].width - m.side * 2 - (perRow - 1) * m.coverGap) / perRow) : 0
  const stripCovers = await Promise.all(stripBooks.map((b) => cover(coverFor(b.coverImage, stripWidth))))

  const heading = { fontSize: m.line, fontWeight: 600, color: p.muted, marginBottom: m.line * 0.6, textTransform: 'uppercase' as const, letterSpacing: 2 }
  const row = m.line * 1.15
  const bar = size === 'square' ? 180 : 220

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginTop: m.gap }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: m.gap * 0.6 }}>
        {numbers.map((n, i) => (
          <div key={n.label} style={{ display: 'flex', flexDirection: 'column', width: '50%', paddingRight: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: m.big * 0.12 }}>
              {n.label === 'average rating' && <svg width={m.big * 0.7} height={m.big * 0.7} viewBox="0 0 24 24"><path d={STAR_PATH} fill={p.accent} /></svg>}
              <span style={{ fontSize: n.value.length > 6 ? m.big * 0.8 : m.big, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: i === 0 ? p.accent : p.ink }}>{n.value}</span>
            </div>
            <span style={{ marginTop: 6, fontSize: m.line, color: p.muted }}>{n.label}</span>
          </div>
        ))}
      </div>

      {/* The space left over is shared between the sections rather than pooled above the covers. */}
      <div style={{ display: 'flex', flex: 1, minHeight: m.gap }} />
      {(showRatings || genres.length > 0) && (
        <div style={{ display: 'flex', gap: m.gap }}>
          {showRatings && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={heading}>Ratings</span>
              {[5, 4, 3, 2, 1].map((star) => {
                const n = card.ratings[star - 1]
                return (
                  <div key={star} style={{ display: 'flex', alignItems: 'center', height: row, marginBottom: 6, fontSize: m.line * 0.9 }}>
                    <span style={{ width: m.line * 0.8, fontWeight: 600 }}>{String(star)}</span>
                    <svg width={m.line * 0.8} height={m.line * 0.8} viewBox="0 0 24 24"><path d={STAR_PATH} fill={p.accent} /></svg>
                    <div style={{ display: 'flex', width: bar, height: m.line * 0.5, marginLeft: 12, borderRadius: 999, background: p.track }}>
                      <div style={{ display: 'flex', width: Math.round((bar * n) / most), height: '100%', borderRadius: 999, background: p.accent }} />
                    </div>
                    <span style={{ marginLeft: 12, color: p.muted }}>{fmt(n)}</span>
                  </div>
                )
              })}
            </div>
          )}
          {genres.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={heading}>Top genres</span>
              {genres.map((g, i) => (
                <div key={g.name} style={{ display: 'flex', alignItems: 'baseline', marginBottom: m.line * 0.5, fontSize: i === 0 ? m.line * 1.4 : m.line * 1.1 }}>
                  <span style={{ fontWeight: 800 }}>{g.name}</span>
                  <span style={{ marginLeft: 10, fontSize: m.line * 0.9, color: p.muted }}>{fmt(g.count)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: m.gap }} />
      {stripBooks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: m.coverGap, rowGap: m.coverGap }}>
          {stripBooks.map((b, i) => (
            <Cover key={b.id} id={`t${i}`} book={b} src={stripCovers[i]} width={stripWidth} height={Math.floor(stripWidth * 1.5)} p={p} stars={false} overlayRating={false} />
          ))}
        </div>
      )}
    </div>
  )
}
