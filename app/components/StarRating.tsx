"use client"
import { FC, KeyboardEvent, useRef, useState } from 'react'
import { IoIosStar, IoIosStarOutline } from "react-icons/io"

interface StarRatingProps {
  value?: number
  onChange: (value: number) => void
  disabled?: boolean
  label?: string
}

const StarRating: FC<StarRatingProps> = ({ value, onChange, disabled, label = "Rating" }) => {
  const [hovered, setHovered] = useState<number | null>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const current = value ?? 0
  const display = hovered ?? current

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, n: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = Math.max(1, Math.min(5, n + step))
    buttons.current[next - 1]?.focus()
    // Callers treat re-selecting the current value as "clear", so only report real moves.
    if (next !== current) onChange(next)
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex -ml-1" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          ref={(el) => { buttons.current[n - 1] = el }}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          tabIndex={(current || 1) === n ? 0 : -1}
          disabled={disabled}
          onMouseEnter={() => setHovered(n)}
          onClick={() => onChange(n)}
          onKeyDown={(e) => onKeyDown(e, n)}
          className="p-1 rounded-md disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {display >= n ? <IoIosStar size={28} color="#f44336" aria-hidden /> : <IoIosStarOutline size={28} color="#f44336" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

export default StarRating
