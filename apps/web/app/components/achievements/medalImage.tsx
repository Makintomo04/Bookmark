import { ImageResponse } from 'next/og'
import type { AchievementDefinition, Milestone } from '@/lib/achievements-catalog'
import { shade } from '@/lib/colour'
import { MEDAL_INK, getMedalColour } from './achievementTheme'
import { getAchievementIcon } from './achievementIcons'
import { siteUrl } from '@/lib/siteUrl'

// The medal card: what a shared medal link unfurls to (app/(main)/u/[username]/medals/[medal]). The
// celebration's colour band, with the medal sitting over its edge.

export const MEDAL_OG_SIZE = { width: 1200, height: 630 }

const BRAND = '#F13C3C'
const BG = '#0B0B0C'
const INK = '#FAFAFA'
const MUTED = '#A1A1AA'
const BOOKMARK_PATH = 'M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z'

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

const siteHost = new URL(siteUrl).host
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

// lucide icons are forwardRef components, which Satori can't call; render to their <svg> element directly.
function icon(key: string, sizePx: number) {
  const Icon = getAchievementIcon(key) as unknown as { render: (props: object, ref: null) => JSX.Element }
  return Icon.render({ size: sizePx, color: MEDAL_INK, strokeWidth: 1.75 }, null)
}

interface MedalImageInput {
  username: string
  // Shown in place of the username when set; the address under it stays the username.
  displayName?: string | null
  achievement: AchievementDefinition
  milestone: Milestone
}

export async function medalOgImage(input: MedalImageInput) {
  const { achievement, milestone } = input
  const colour = getMedalColour(achievement.key)
  const username = clip(input.displayName || input.username, 22)
  const rung = achievement.describe(milestone.value)
  const detail = `${achievement.title} · ${rung}`
  const footer = `${username} on Bookmark`
  const profileUrl = `${siteHost}/u/${clip(input.username, 22)}`

  const text = ['Bookmark', 'MEDAL EARNED', milestone.title, detail, footer, profileUrl].join('') + '0123456789·…'
  const [regular, semibold, black] = await Promise.all([interFont(400, text), interFont(600, text), interFont(800, text)])
  const fonts = [regular, semibold, black].filter((f): f is NonNullable<typeof f> => !!f)

  const band = 250
  const medalSize = 220
  const gap = 12

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', background: BG, color: INK, fontFamily: fonts.length ? 'Inter' : undefined }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            height: band,
            paddingTop: 40,
            background: colour,
            backgroundImage: `radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.22), rgba(255,255,255,0) 60%)`,
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: 4, color: MEDAL_INK }}>MEDAL EARNED</span>
        </div>

        {/* The medal, ringed in the card's background so it reads as sitting over the band. */}
        <div
          style={{
            display: 'flex',
            marginTop: -(medalSize / 2 + gap),
            padding: gap,
            borderRadius: 999,
            background: BG,
          }}
        >
          <div style={{ display: 'flex', width: medalSize, height: medalSize, borderRadius: 999, background: shade(colour, -0.3), alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', width: medalSize * 0.88, height: medalSize * 0.88, borderRadius: 999, background: colour, alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', width: medalSize * 0.73, height: medalSize * 0.73, borderRadius: 999, border: `3px solid ${MEDAL_INK}73`, alignItems: 'center', justifyContent: 'center' }}>
                {icon(achievement.key, 84)}
              </div>
            </div>
          </div>
        </div>

        <span style={{ marginTop: 18, fontSize: milestone.title.length > 22 ? 52 : 64, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>{milestone.title}</span>
        <span style={{ marginTop: 14, fontSize: 28, color: MUTED }}>{detail}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto', marginBottom: 40 }}>
          <svg width="26" height="27" viewBox="0 0 30 31"><path d={BOOKMARK_PATH} fill={BRAND} /></svg>
          <span style={{ fontSize: 24, fontWeight: 600 }}>{footer}</span>
          <span style={{ fontSize: 22, color: MUTED, marginLeft: 6 }}>{profileUrl}</span>
        </div>
      </div>
    ),
    { ...MEDAL_OG_SIZE, fonts: fonts.length ? fonts : undefined }
  )
}
