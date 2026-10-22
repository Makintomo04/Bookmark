import { FC, ReactNode, useId } from 'react'
import { shade } from '@/lib/colour'
import { cn } from '@/lib/utils'
import type { BannerPresetId } from '@/lib/banners'

// Draws a preset in the reader's colour. Broad shapes survive the header and picker crops.
interface BannerPatternProps {
  preset: BannerPresetId
  colour: string
  className?: string
}

type Tones = { base: string; light: string; lighter: string; dark: string }

const W = 1200
const H = 400

type TileShape = 'quarter' | 'half' | 'circle' | 'triangle' | null

// Rows of shapes, cropped by the banner's edges; null leaves a tile empty.
const TILE_LAYOUT: TileShape[][] = [
  [null, null, 'half', 'quarter', null, 'circle', 'triangle'],
  [null, null, 'circle', 'triangle', 'half', 'quarter', 'circle'],
  [null, null, 'quarter', null, 'circle', 'half', null],
]

function tilePath(shape: Exclude<TileShape, null>, x: number, y: number, s: number) {
  const h = s / 2
  if (shape === 'quarter') return `M${x} ${y} H${x + s} A ${s} ${s} 0 0 1 ${x} ${y + s} Z`
  if (shape === 'half') return `M${x} ${y + s} A ${h} ${h} 0 0 1 ${x + s} ${y + s} Z`
  if (shape === 'circle') return `M${x} ${y + h} A ${h} ${h} 0 1 0 ${x + s} ${y + h} A ${h} ${h} 0 1 0 ${x} ${y + h} Z`
  return `M${x} ${y} H${x + s} V${y + s} Z`
}

// Four leaf-shaped petals behind, four in front turned 45 degrees, and a round centre.
const Flower: FC<{ cx: number; cy: number; length: number; width: number; back: string; front: string; centre: string }> = ({ cx, cy, length, width, back, front, centre }) => {
  const petal = `M${cx} ${cy} Q ${cx + width} ${cy - length / 2} ${cx} ${cy - length} Q ${cx - width} ${cy - length / 2} ${cx} ${cy} Z`
  return (
    <g>
      {[0, 90, 180, 270].map((a) => <path key={`b${a}`} d={petal} fill={back} transform={`rotate(${a} ${cx} ${cy})`} />)}
      {[45, 135, 225, 315].map((a) => <path key={`f${a}`} d={petal} fill={front} transform={`rotate(${a} ${cx} ${cy})`} />)}
      <circle cx={cx} cy={cy} r={length * 0.22} fill={centre} />
    </g>
  )
}

// Every preset keeps its shapes inside the safe area: the picker thumbnail shows only x 240-960, the
// desktop header only y 110-290, and the avatar covers the bottom left, so that corner stays quiet.
const PATTERNS: Record<BannerPresetId, (t: Tones, id: string) => ReactNode> = {
  plain: () => null,

  // Nested arches rising from the bottom edge, right of centre.
  arches: (t) => (
    <g>
      <circle cx="760" cy="420" r="300" fill={t.dark} />
      <circle cx="760" cy="420" r="230" fill={t.light} />
      <circle cx="760" cy="420" r="160" fill={t.lighter} />
      <circle cx="760" cy="420" r="90" fill={t.base} />
    </g>
  ),

  // A large sun with a small moon beside it.
  orbit: (t) => (
    <g>
      <circle cx="820" cy="200" r="170" fill={t.light} />
      <circle cx="880" cy="160" r="90" fill={t.lighter} />
      <circle cx="560" cy="250" r="42" fill={t.dark} />
    </g>
  ),

  // Two broad bands rolling across the middle.
  waves: (t) => (
    <g>
      <path d={`M0 210 C 200 130, 400 130, 600 210 S 1000 290, 1200 210 V${H} H0 Z`} fill={t.light} />
      <path d={`M0 270 C 200 190, 400 190, 600 270 S 1000 350, 1200 270 V${H} H0 Z`} fill={t.dark} />
    </g>
  ),

  // A full-bleed grid of Bauhaus tiles. The middle row lines up with the desktop crop (y 110-290), and
  // the first two columns stay empty so the avatar sits on plain colour.
  tiles: (t) => {
    const size = 180
    const tones = [t.light, t.dark, t.lighter]
    return (
      <g>
        {TILE_LAYOUT.flatMap((row, r) =>
          row.map((shape, c) => {
            if (!shape) return null
            const x = c * size - 60
            const y = r * size - 70
            return <path key={`${r}-${c}`} d={tilePath(shape, x, y, size)} fill={tones[(r + c) % tones.length]} />
          })
        )}
      </g>
    )
  },

  // An eight-petal bloom with a bud beside it, petals in two tones.
  bloom: (t) => (
    <g>
      <Flower cx={820} cy={205} length={165} width={78} back={t.dark} front={t.light} centre={t.lighter} />
      <Flower cx={555} cy={275} length={62} width={30} back={t.light} front={t.lighter} centre={t.dark} />
    </g>
  ),
}

const BannerPattern: FC<BannerPatternProps> = ({ preset, colour, className }) => {
  // Keep SVG ids unique for server-rendered instances.
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
      className={cn('absolute inset-0 h-full w-full', className)}
      style={{ background: colour }}
    >
      <g data-banner-pattern={id}>{PATTERNS[preset](tones, id)}</g>
    </svg>
  )
}

export default BannerPattern
