"use client"
import { FC, KeyboardEvent, MouseEvent, useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value?: number | null
  // Receives the new rating, or 0 when it's cleared (clicking the current rating, or Delete).
  onChange?: (value: number) => void
  disabled?: boolean
  // Display only: no focus, no hover, read out as "3.5 out of 5 stars".
  readOnly?: boolean
  label?: string
  size?: number
  className?: string
}

const STEP = 0.5

// An empty outline in the control-border colour (3:1 in both themes), with the brand fill clipped over it.
const StarIcon: FC<{ fill: number; size: number }> = ({ fill, size }) => (
  <span className="relative block" style={{ width: size, height: size }}>
    <Star size={size} className="absolute inset-0 text-input" />
    {fill > 0 && (
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: size * fill }}>
        <Star size={size} className="text-brand" fill="currentColor" />
      </span>
    )}
  </span>
)

const clampRating = (n: number) => Math.max(STEP, Math.min(5, Math.round(n / STEP) * STEP))
export const formatRating = (n: number) => `${n} ${n === 1 ? "star" : "stars"}`

// Which value a pointer over star n means: its left half is n - 0.5.
const pointerValue = (e: MouseEvent<HTMLElement>, n: number) => {
  const { left, width } = e.currentTarget.getBoundingClientRect()
  return e.clientX - left < width / 2 ? n - STEP : n
}

const StarRating: FC<StarRatingProps> = ({ value, onChange, disabled, readOnly, label = "Rating", size = 28, className }) => {
  const [hovered, setHovered] = useState<number | null>(null)
  const current = value ?? 0
  const interactive = !readOnly && !disabled && !!onChange
  const display = (interactive && hovered) || current

  const set = (next: number) => {
    if (!interactive) return
    // Clicking the current rating clears it.
    onChange!(next === current ? 0 : next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    const moves: Record<string, number> = {
      ArrowRight: current + STEP, ArrowUp: current + STEP,
      ArrowLeft: current - STEP, ArrowDown: current - STEP,
      PageUp: current + 1, PageDown: current - 1,
      Home: STEP, End: 5,
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      if (current) onChange!(0)
      return
    }
    if (!(e.key in moves)) return
    e.preventDefault()
    const next = clampRating(moves[e.key])
    // Only report real moves, so holding an arrow at either end doesn't clear the rating.
    if (next !== current) onChange!(next)
  }

  const stars = [1, 2, 3, 4, 5].map((n) => {
    const fill = display >= n ? 1 : display >= n - STEP ? 0.5 : 0
    return (
      <span
        key={n}
        aria-hidden
        onMouseMove={interactive ? (e) => setHovered(pointerValue(e, n)) : undefined}
        onClick={interactive ? (e) => set(pointerValue(e, n)) : undefined}
        className={cn(interactive && "p-1 cursor-pointer", !readOnly && !interactive && "p-1")}
      >
        <StarIcon fill={fill} size={size} />
      </span>
    )
  })

  if (readOnly) {
    return (
      <div role="img" aria-label={current ? `${label}: ${current} out of 5 stars` : `${label}: not rated`} className={cn("flex", className)}>
        {stars}
      </div>
    )
  }

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={STEP}
      aria-valuemax={5}
      aria-valuenow={current || undefined}
      aria-valuetext={current ? formatRating(current) : "Not rated"}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "flex w-fit -ml-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      {stars}
    </div>
  )
}

export default StarRating
