"use client"
import { FC, useState } from 'react'
import { EyeOff, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReviewTextProps {
  review: string
  spoiler?: boolean
  // Owner only: this review is hidden from everyone else.
  hidden?: boolean
  // Longer reviews are cut here with a "Read more".
  maxChars?: number
  className?: string
}

// Cut at a word boundary so the preview doesn't end mid-word.
function preview(text: string, max: number) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

// A review as others see it: spoilers stay covered until the reader asks, long ones are truncated.
const ReviewText: FC<ReviewTextProps> = ({ review, spoiler = false, hidden = false, maxChars = 280, className }) => {
  const [revealed, setRevealed] = useState(!spoiler)
  const [expanded, setExpanded] = useState(false)
  const isLong = review.length > maxChars

  return (
    <div className={cn("text-sm", className)}>
      {(hidden || spoiler) && (
        <p className="mb-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {hidden && <span className="inline-flex items-center gap-1"><Lock size={12} aria-hidden />Only you can see this review</span>}
          {spoiler && revealed && <span className="inline-flex items-center gap-1"><EyeOff size={12} aria-hidden />Contains spoilers</span>}
        </p>
      )}
      {revealed ? (
        <>
          <p className="whitespace-pre-line break-words">{expanded || !isLong ? review : preview(review, maxChars)}</p>
          {isLong && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="w-full rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 px-3 py-2.5 text-left text-muted-foreground hover:text-foreground hover:border-neutral-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="inline-flex items-center gap-1.5 font-medium"><EyeOff size={14} aria-hidden />This review contains spoilers</span>
          <span className="block text-xs">Click to reveal</span>
        </button>
      )}
    </div>
  )
}

export default ReviewText
