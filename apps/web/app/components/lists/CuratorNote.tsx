import { FC } from 'react'
import { readerName } from '@/lib/profile'
import Image from 'next/image'
import Link from 'next/link'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { cn } from '@/lib/utils'
import InitialAvatar from '@/app/components/profile/InitialAvatar'
import type { Curator, Reason } from '@/lib/listRules'
import StaffSeal from '../profile-head/StaffSeal'

export const DEFAULT_ACCENT = "#D92D2D"
export const accentOf = (person: Curator) => person.favColour || DEFAULT_ACCENT

export const CuratorAvatar: FC<{ person: Curator, size?: number, className?: string }> = ({ person, size = 24, className }) => (
  <span
    className={cn("relative inline-block shrink-0 overflow-hidden", className)}
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.35), background: accentOf(person), ...tierRingStyle(booksReadOf(person)) }}
  >
    {person.image
      ? <Image src={person.image} alt="" fill sizes={`${size}px`} className="object-cover" />
      : <InitialAvatar username={person.username} favColour={person.favColour} />}
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
  const handle = reason.by.username
  const name = readerName(reason.by)
  return (
    <figure
      className={cn("relative rounded-lg border-l-[3px] bg-neutral-50 dark:bg-neutral-900/60", full ? "p-4" : "px-2.5 py-2", className)}
      style={{ borderLeftColor: accent }}
    >
      <figcaption className={cn("flex items-center gap-1.5 min-w-0", full ? "mb-2" : "mb-1")}>
        <CuratorAvatar person={reason.by} size={full ? 28 : 18} />
        <span className={cn("min-w-0 truncate", full ? "text-sm" : "text-[11px]")}>
          {handle ? (
            <>
              <Link href={`/u/${handle}`} className="font-semibold hover:underline underline-offset-2">{name}</Link>
              {/* Only marks the role: the caption is cut short when long, which would clip its explanation. */}
              {reason.by.staffBadge && <StaffSeal kind={reason.by.staffBadge} size={full ? 16 : 13} pressable={false} className={cn("ml-1", full ? "align-[-3px]" : "align-[-2px]")} />}
            </>
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
