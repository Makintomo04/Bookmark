import { FC, ReactNode, useId } from 'react'
import { shade } from '@/lib/colour'
import { cn } from '@/lib/utils'
import type { BannerPresetId } from '@/lib/banners'

// Draws a preset banner in the reader's colour. No "use client": the public profile renders it on the
// server, and the edit modal, onboarding and picker pull it into their client trees. Every preset is a
// 1200x400 scene cropped to fit, so the same drawing serves the header, the modal preview and the
// picker's thumbnails.

interface BannerPatternProps {
  preset: BannerPresetId
  colour: string
  className?: string
}

type Tones = { base: string; light: string; lighter: string; dark: string }

// Deterministic "random" so the server and client draw the same confetti.
function lcg(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const W = 1200
const H = 400

const PATTERNS: Record<BannerPresetId, (t: Tones, id: string) => ReactNode> = {
  plain: () => null,

  dots: (t, id) => (
    <>
      <pattern id={`${id}-p`} width="72" height="72" patternUnits="userSpaceOnUse">
        <circle cx="36" cy="36" r="8" fill={t.light} />
      </pattern>
      <rect width={W} height={H} fill={`url(#${id}-p)`} />
    </>
  ),

  stripes: (t, id) => (
    <>
      <pattern id={`${id}-p`} width="112" height="112" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
        <rect width="56" height="112" fill={t.light} opacity="0.55" />
      </pattern>
      <rect width={W} height={H} fill={`url(#${id}-p)`} />
    </>
  ),

  contours: (t) => (
    <g fill="none" stroke={t.light} strokeWidth="5" strokeLinecap="round">
      {Array.from({ length: 11 }, (_, i) => {
        const y = -40 + i * 44
        return (
          <path
            key={i}
            opacity={0.35 + (i % 3) * 0.25}
            d={`M-60 ${y + 40} C 180 ${y - 30}, 330 ${y + 150}, 600 ${y + 60} S 980 ${y - 40}, 1260 ${y + 90}`}
          />
        )
      })}
    </g>
  ),

  chevrons: (t, id) => (
    <>
      <pattern id={`${id}-p`} width="200" height="100" patternUnits="userSpaceOnUse">
        <polyline points="0,75 100,25 200,75" fill="none" stroke={t.light} strokeWidth="22" strokeLinejoin="round" opacity="0.7" />
      </pattern>
      <rect width={W} height={H} fill={`url(#${id}-p)`} />
    </>
  ),

  halftone: (t) => (
    <g fill={t.light}>
      {Array.from({ length: 30 }, (_, col) =>
        Array.from({ length: 10 }, (_, row) => (
          <circle key={`${col}-${row}`} cx={20 + col * 40} cy={20 + row * 40} r={(1.5 + 15 * (col / 29)).toFixed(1)} />
        ))
      )}
    </g>
  ),

  bookshelf: (t) => {
    const widths = [40, 56, 46, 64, 36, 52, 44, 60]
    const heights = [230, 270, 250, 290, 210, 260, 240, 300]
    const tones = [t.light, t.dark, t.lighter, t.dark, t.light, t.dark]
    const books: ReactNode[] = []
    let x = -10
    for (let i = 0; x < W; i++) {
      const w = widths[i % widths.length]
      const h = heights[(i * 5) % heights.length]
      const fill = tones[i % tones.length]
      books.push(
        <g key={i}>
          <rect x={x} y={H - h} width={w} height={h} rx="3" fill={fill} />
          <rect x={x + 6} y={H - h + 24} width={w - 12} height="10" rx="2" fill={t.base} opacity="0.55" />
          <rect x={x + 6} y={H - 40} width={w - 12} height="6" rx="2" fill={t.base} opacity="0.55" />
        </g>
      )
      x += w + 7
    }
    return <>{books}</>
  },

  arcs: (t) => (
    <g fill="none" strokeWidth="44">
      {[70, 160, 250, 340, 430, 520, 610].map((r, i) => (
        <circle key={r} cx="980" cy="440" r={r} stroke={i % 2 ? t.dark : t.light} opacity={i % 2 ? 0.75 : 1} />
      ))}
    </g>
  ),

  corners: (t, id) => (
    <>
      <pattern id={`${id}-p`} width="120" height="120" patternUnits="userSpaceOnUse">
        <polygon points="120,0 120,120 0,120" fill={t.light} opacity="0.45" />
      </pattern>
      <rect width={W} height={H} fill={`url(#${id}-p)`} />
    </>
  ),

  waves: (t) => (
    <>
      {[60, 130, 200, 270, 340].map((y, i) => (
        <path
          key={y}
          fill={i % 2 ? t.dark : t.light}
          opacity={i % 2 ? 0.8 : 1}
          d={`M0 ${y} Q 150 ${y - 44} 300 ${y} T 600 ${y} T 900 ${y} T 1200 ${y} V ${H} H 0 Z`}
        />
      ))}
    </>
  ),

  rays: (t) => (
    <g fill={t.light} opacity="0.6">
      {Array.from({ length: 12 }, (_, i) => {
        const a1 = (i * 7.5 * Math.PI) / 180
        const a2 = ((i * 7.5 + 3.75) * Math.PI) / 180
        const R = 1600
        return (
          <polygon
            key={i}
            points={`0,${H} ${(R * Math.cos(a1)).toFixed(0)},${(H - R * Math.sin(a1)).toFixed(0)} ${(R * Math.cos(a2)).toFixed(0)},${(H - R * Math.sin(a2)).toFixed(0)}`}
          />
        )
      })}
    </g>
  ),

  blobs: (t, id) => (
    <>
      <defs>
        {[
          ['a', t.lighter],
          ['b', t.dark],
          ['c', t.light],
        ].map(([k, c]) => (
          <radialGradient key={k} id={`${id}-${k}`}>
            <stop offset="0%" stopColor={c} stopOpacity="1" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <circle cx="220" cy="90" r="420" fill={`url(#${id}-a)`} />
      <circle cx="900" cy="380" r="480" fill={`url(#${id}-b)`} />
      <circle cx="1120" cy="40" r="300" fill={`url(#${id}-c)`} />
      <circle cx="560" cy="260" r="260" fill={`url(#${id}-a)`} opacity="0.6" />
    </>
  ),

  confetti: (t) => {
    const rand = lcg(7)
    const tones = [t.light, t.dark, t.lighter]
    return (
      <>
        {Array.from({ length: 70 }, (_, i) => {
          const x = (rand() * W).toFixed(0)
          const y = (rand() * H).toFixed(0)
          const rot = (rand() * 180).toFixed(0)
          const round = rand() > 0.7
          return round
            ? <circle key={i} cx={x} cy={y} r="12" fill={tones[i % 3]} />
            : <rect key={i} x={x} y={y} width="40" height="16" rx="3" fill={tones[i % 3]} transform={`rotate(${rot} ${x} ${y})`} />
        })}
      </>
    )
  },

  dusk: (t, id) => (
    <>
      <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={t.dark} />
        <stop offset="55%" stopColor={t.base} />
        <stop offset="100%" stopColor={t.lighter} />
      </linearGradient>
      <rect width={W} height={H} fill={`url(#${id}-g)`} />
    </>
  ),

  graph: (t, id) => (
    <>
      <pattern id={`${id}-p`} width="96" height="96" patternUnits="userSpaceOnUse">
        <path d="M96 0 V96 M0 96 H96" fill="none" stroke={t.light} strokeWidth="4" opacity="0.5" />
      </pattern>
      <rect width={W} height={H} fill={`url(#${id}-p)`} />
      <circle cx="1000" cy="200" r="140" fill={t.light} opacity="0.4" />
    </>
  ),
}

const BannerPattern: FC<BannerPatternProps> = ({ preset, colour, className }) => {
  // Gradient and tile ids must be unique per instance (the picker draws fifteen at once). useId covers one
  // tree; the colour is added so two trees on a page can't share an id either. Colons aren't safe in url(#…).
  const id = `bp${useId().replace(/:/g, '')}${colour.replace(/[^0-9a-z]/gi, '')}`
  const tones: Tones = {
    base: colour,
    light: shade(colour, 0.28),
    lighter: shade(colour, 0.5),
    dark: shade(colour, -0.22),
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
      className={cn("absolute inset-0 h-full w-full", className)}
      style={{ background: colour }}
    >
      {PATTERNS[preset](tones, id)}
    </svg>
  )
}

export default BannerPattern
