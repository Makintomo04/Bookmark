"use client"
import { FC, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { STAFF_BADGE, type StaffBadgeKind } from '@/lib/staffBadge'

// The staff seal (lib/staffBadge.ts), so readers can tell real staff from someone pretending. It sits on
// the avatar where the avatar is big, and beside the name where it isn't; never both. Pressing it says
// what the role is, since a hover title never shows on a phone.
//
// name is who the popover says holds the role. cutOut draws a ring in the page colour round the seal, to
// lift it off an avatar. pressable={false} for a seal inside a link (a notification row), where a button
// can't go: it only marks the role. shine sweeps a band of light across it once as the page settles, then on
// hover or press, never on a loop: looping shimmer belongs to the gold, platinum and diamond tier frames.
const StaffSeal: FC<{ kind: StaffBadgeKind; size: number | string; name?: string | null; cutOut?: boolean; shine?: boolean; pressable?: boolean; className?: string }> = ({ kind, size, name, cutOut, shine, pressable = true, className }) => {
  const badge = STAFF_BADGE[kind]
  const [open, setOpen] = useState(false)
  // Bumped on arrival, hover and press, so the sweep's element remounts and plays again.
  const [shines, setShines] = useState(0)
  const clip = useId()

  // The one sweep on arrival, once the page has settled. The CSS skips it for reduced motion.
  useEffect(() => {
    if (!shine) return
    const t = setTimeout(() => setShines((n) => n || 1), 600)
    return () => clearTimeout(t)
  }, [shine])
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  // The cut-out is a wider circle behind, in the page colour.
  const draw = (px: number | string, ring?: boolean, sweep?: boolean) => (
    <svg viewBox="-2 -2 28 28" style={{ width: px, height: px }} className="shrink-0" aria-hidden>
      {ring && <circle cx={12} cy={12} r={14} className="fill-background" />}
      <circle cx={12} cy={12} r={12} fill={badge.colour} />
      {sweep && (
        <>
          <defs>
            <clipPath id={clip}><circle cx={12} cy={12} r={12} /></clipPath>
            <linearGradient id={`${clip}-band`}>
              <stop offset="0" stopColor="#fff" stopOpacity={0} />
              <stop offset="0.5" stopColor="#fff" stopOpacity={0.7} />
              <stop offset="1" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <g clipPath={`url(#${clip})`}>
            <g key={shines} className={cn("staff-shine", shines > 0 && "staff-shine-once")}>
              <rect x={6} y={-6} width={12} height={36} fill={`url(#${clip}-band)`} transform="rotate(20 12 12)" />
            </g>
          </g>
        </>
      )}
      <path d={badge.glyph} fill={badge.ink} />
    </svg>
  )
  const seal = draw(size, cutOut, shine)

  if (!pressable) return <span role="img" aria-label={badge.label} title={badge.title} className={cn("inline-flex shrink-0", className)}>{seal}</span>

  return (
    <span ref={ref} className={cn("relative inline-flex shrink-0", className)}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setShines((n) => n + 1) }}
        // A mouse only: a tap's pointerenter would play it twice with the click.
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setShines((n) => n + 1) }}
        aria-label={badge.label}
        aria-expanded={open}
        title={badge.title}
        className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {seal}
      </button>
      {open && (
        <span role="status" className="absolute left-0 top-full z-20 mt-2 w-56 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background p-3 text-left text-sm font-normal shadow-lg">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">{draw(18)}{badge.who(name)}</span>
          <span className="mt-1 block text-muted-foreground">{badge.about}</span>
        </span>
      )}
    </span>
  )
}

export default StaffSeal
