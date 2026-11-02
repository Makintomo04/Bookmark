import { FC, useId } from 'react'
import type { ReaderTier } from '@/lib/readerTier'

// A rung on the tier carousel: the five reader tiers, plus a "New reader" step before Bronze so a reader
// with under 10 books still has something earned in the middle.
export type TierStep = Omit<ReaderTier, "key"> & { key: ReaderTier["key"] | "new" }

// The emblem is a bookmark ribbon: a metal rim around an inset, polished face, with its motif engraved flat
// into the face. Each tier adds a detail: Silver an inner border, studs and a star, Gold a red jewel seal
// and the sweep of light, Platinum a crown, Diamond the mark cut as a gem.
const RIBBON = "M22 18 Q22 8 32 8 H88 Q98 8 98 18 V120 L60 98 L22 120 Z"
const FACE = "M27 19 Q27 13 33 13 H87 Q93 13 93 19 V111 L60 92.5 L27 111 Z"
const INNER = "M34 25 Q34 21 38 21 H82 Q86 21 86 25 V101 L60 87 L34 101 Z"
// The Bookmark mark (public/logo.svg), centred on the face.
const MARK = "M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z"
const MARK_PLACE = "translate(60 50) scale(.95) translate(-15.4 -15.6)"
// Diamond's gem is the mark itself, faceted: an outline of the mark in its own units, a table (the flat top)
// shrunk towards a centre left of the notch, and the facets between them, each lit differently. The facets are
// clipped to the real mark so its rounded corners stay round.
const GEM = [[.9, .6], [25.5, .6], [29.6, 4.5], [23.7, 15.6], [29.6, 26.6], [25.5, 30.5], [.9, 30.5]]
const GEM_TABLE = GEM.map(([x, y]) => [11 + (x - 11) * .45, 15.6 + (y - 15.6) * .45])
const FACET_LIGHT = [.38, .1, .24, .04, .16, .3, .12]

// The emblem's height over its width, for laying out the carousel.
export const EMBLEM_ASPECT = 142 / 120

function star(x: number, y: number, r: number) {
  const a = r * .12, b = r * .3
  return `M${x} ${y - r} C${x + a} ${y - b} ${x + b} ${y - a} ${x + r} ${y} C${x + b} ${y + a} ${x + a} ${y + b} ${x} ${y + r} ` +
    `C${x - a} ${y + b} ${x - b} ${y + a} ${x - r} ${y} C${x - b} ${y - a} ${x - a} ${y - b} ${x} ${y - r} Z`
}

const TierEmblem: FC<{ step: TierStep; rank: number }> = ({ step: t, rank }) => {
  const id = useId().replace(/:/g, "")
  const metal = `url(#${id}-m)`
  const stud = (x: number, y: number, r = 2.4) =>
    <circle key={`${x},${y}`} cx={x} cy={y} r={r} fill={`url(#${id}-s)`} stroke={t.shade} strokeWidth={.5} />

  if (t.key === "new") {
    return (
      <svg viewBox="0 -18 120 142" aria-hidden className="block h-auto w-full overflow-visible">
        <path d={RIBBON} fill={t.shade} fillOpacity={.3} stroke={t.colour} strokeWidth={2.5} strokeDasharray="6 5" strokeLinejoin="round" />
        <path d={MARK} transform={MARK_PLACE} fill="none" stroke={t.colour} strokeWidth={1.9} strokeLinejoin="round" />
      </svg>
    )
  }

  const pts = (p: number[][]) => p.map((q) => q.join(",")).join(" ")
  return (
    <svg viewBox="0 -18 120 142" aria-hidden className="block h-auto w-full overflow-visible">
      <defs>
        <linearGradient id={`${id}-m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.light} /><stop offset=".45" stopColor={t.colour} /><stop offset="1" stopColor={t.shade} />
        </linearGradient>
        <linearGradient id={`${id}-f`} x1=".15" y1="0" x2=".85" y2="1">
          <stop offset="0" stopColor={t.colour} /><stop offset=".28" stopColor={t.light} /><stop offset=".42" stopColor={t.colour} />
          <stop offset=".78" stopColor={t.colour} /><stop offset="1" stopColor={t.shade} />
        </linearGradient>
        <radialGradient id={`${id}-s`} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#fff" /><stop offset=".35" stopColor={t.light} /><stop offset="1" stopColor={t.shade} />
        </radialGradient>
        <radialGradient id={`${id}-j`} cx=".4" cy=".35" r=".75">
          <stop offset="0" stopColor="#FF8A80" /><stop offset=".5" stopColor="#D92D2D" /><stop offset="1" stopColor="#5E0B0B" />
        </radialGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E6FAFF" /><stop offset=".4" stopColor="#4FC3EC" /><stop offset="1" stopColor="#4B2FB8" />
        </linearGradient>
        <linearGradient id={`${id}-sh`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".6" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-c`}><path d={RIBBON} /></clipPath>
        <clipPath id={`${id}-cf`}><path d={FACE} /></clipPath>
        <clipPath id={`${id}-mk`}><path d={MARK} /></clipPath>
      </defs>

      {rank >= 4 && (
        <>
          <path d="M38 12 L34 -7 L47 3 L60 -13 L73 3 L86 -7 L82 12 Z" fill={metal} stroke={t.shade} strokeWidth={1.3} strokeLinejoin="round" />
          <path d="M40 9 L37 -2 L47 6 L60 -6 L73 6 L83 -2 L80 9" fill="none" stroke={t.light} strokeWidth={.9} opacity={.8} strokeLinejoin="round" />
          {stud(34, -7, 2.8)}{stud(60, -13, 3.2)}{stud(86, -7, 2.8)}
        </>
      )}

      <path d={RIBBON} fill={metal} stroke={t.shade} strokeWidth={1.6} strokeLinejoin="round" />
      <path d={FACE} transform="translate(.8 .8)" fill="none" stroke={t.light} strokeWidth={1.2} opacity={.6} />
      <path d={FACE} fill={`url(#${id}-f)`} stroke={t.shade} strokeWidth={1} strokeOpacity={.8} />
      <g clipPath={`url(#${id}-cf)`}>
        <ellipse cx={44} cy={22} rx={40} ry={16} fill="#fff" opacity={.22} transform="rotate(-24 44 22)" />
      </g>
      {t.shimmer && (
        <g clipPath={`url(#${id}-c)`}>
          <rect className="tier-emblem-sweep" x={0} y={-10} width={34} height={150} fill={`url(#${id}-sh)`} transform="translate(-150 0)" />
        </g>
      )}

      {rank >= 2 && (
        <>
          <path d={INNER} transform="translate(.7 .7)" fill="none" stroke={t.shade} strokeWidth={1.2} opacity={.6} />
          <path d={INNER} fill="none" stroke={t.light} strokeWidth={1.2} opacity={.85} />
          {stud(39, 26)}{stud(81, 26)}
        </>
      )}

      {rank === 5 ? (
        <g transform="translate(60 50) scale(1.15) translate(-15.4 -15.6)">
          <path d={MARK} fill={`url(#${id}-g)`} />
          <g clipPath={`url(#${id}-mk)`}>
            {GEM.map((p, k) => (
              <polygon key={k} points={pts([p, GEM[(k + 1) % GEM.length], GEM_TABLE[(k + 1) % GEM.length], GEM_TABLE[k]])} fill="#fff" opacity={FACET_LIGHT[k]} />
            ))}
            <polygon points={pts(GEM_TABLE)} fill="#fff" opacity={.18} />
            <path d={GEM.map((p, k) => `M${p} L${GEM_TABLE[k]}`).join(" ")} stroke="#fff" strokeWidth={.35} opacity={.5} />
          </g>
          <path d={MARK} fill="none" stroke={t.shade} strokeWidth={2.6} strokeLinejoin="round" />
          <path d={MARK} fill="none" stroke={t.light} strokeWidth={.7} strokeLinejoin="round" opacity={.8} />
          <path d={star(19, 7, 4)} fill="#fff" />
        </g>
      ) : (
        <path d={MARK} transform={MARK_PLACE} fill={t.shade} opacity={.6} />
      )}
      {rank >= 2 && <path d={star(60, 76, 6)} fill={t.shade} opacity={.6} />}

      {(rank === 3 || rank === 4) && (
        <>
          <circle cx={60} cy={12} r={6.2} fill={metal} stroke={t.shade} strokeWidth={.8} />
          <circle cx={60} cy={12} r={4.2} fill={`url(#${id}-j)`} />
          <ellipse cx={58.5} cy={10.3} rx={1.7} ry={1.05} fill="#fff" opacity={.75} />
        </>
      )}
      {rank === 5 && (
        <g fill="#fff" opacity={.9}><path d={star(12, 26, 4)} /><path d={star(110, 56, 3.2)} /><path d={star(104, 4, 2.6)} /></g>
      )}
    </svg>
  )
}

export default TierEmblem
