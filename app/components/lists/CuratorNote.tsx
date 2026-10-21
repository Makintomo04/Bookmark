import { FC } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { cn } from '@/lib/utils'
import type { Curator, Reason } from '@/lib/listRules'

export const DEFAULT_ACCENT = "#D92D2D"
export const accentOf = (person: Curator) => person.favColour || DEFAULT_ACCENT

export const CuratorAvatar: FC<{ person: Curator, size?: number, className?: string }> = ({ person, size = 24, className }) => (
  <span
    className={cn("relative inline-block shrink-0 overflow-hidden", className)}
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.35), background: accentOf(person), ...tierRingStyle(booksReadOf(person)) }}
  >
    <Image src={person.image || "/images/avatar.jpg"} alt="" fill sizes={`${size}px`} className="object-cover" />
  </span>
)

interface CuratorNoteProps {
  reason: Reason
  // "card" sits under a cover in a grid; "full" is the roomier version for book details.
  variant?: "card" | "full"
  label?: string
  className?: string
}

// "Why you'd like this": a person's reason for a book, in their own words and their own colour.
// Every recommendation Bookmark shows comes with one of these, or with a person at least.
const CuratorNote: FC<CuratorNoteProps> = ({ reason, variant = "card", label = "Why you'd like it", className }) => {
  const accent = accentOf(reason.by)
  const full = variant === "full"
  const name = reason.by.username
  return (
    <figure
      className={cn("relative rounded-lg border-l-[3px] bg-neutral-50 dark:bg-neutral-900/60", full ? "p-4" : "px-2.5 py-2", className)}
      style={{ borderLeftColor: accent }}
    >
      <figcaption className={cn("flex items-center gap-1.5 min-w-0", full ? "mb-2" : "mb-1")}>
        <CuratorAvatar person={reason.by} size={full ? 28 : 18} />
        <span className={cn("min-w-0 truncate", full ? "text-sm" : "text-[11px]")}>
          {name ? (
            <Link href={`/u/${name}`} className="font-semibold hover:underline underline-offset-2">{name}</Link>
          ) : (
            <span className="font-semibold">A reader</span>
          )}
          <span className="text-muted-foreground"> · {label}</span>
        </span>
      </figcaption>
      <blockquote className={cn("whitespace-pre-line text-foreground/90", full ? "text-[15px] leading-relaxed" : "text-xs leading-relaxed")}>
        {reason.text}
      </blockquote>
    </figure>
  )
}

export default CuratorNote
