import { FC, ReactNode } from 'react'
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
  // Where the words come from, e.g. the list they're on. The card falls back to "Why you'd like it".
  label?: ReactNode
  className?: string
}

// "Why you'd like this": a person's reason for a book, in their own words and their own colour.
// Every recommendation Bookmark shows comes with one of these, or with a person at least.
const CuratorNote: FC<CuratorNoteProps> = ({ reason, variant = "card", label, className }) => {
  const accent = accentOf(reason.by)
  const handle = reason.by.username
  const name = readerName(reason.by)
  if (variant === "full") {
    // The words first, in the display serif, then who said them and where, like a citation.
    return (
      <figure className={cn("rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 p-4", className)}>
        <blockquote className="font-display text-[15px] leading-relaxed text-foreground/90 whitespace-pre-line">
          {reason.text}
        </blockquote>
        <figcaption className="mt-3 flex items-center gap-2 min-w-0 text-xs text-muted-foreground">
          <CuratorAvatar person={reason.by} size={20} />
          <span className="min-w-0 truncate">
            {handle
              ? <Link href={`/u/${handle}`} className="font-medium text-foreground hover:underline underline-offset-2">{name}</Link>
              : <span className="font-medium text-foreground">A reader</span>}
            {reason.by.staffBadge && <StaffSeal kind={reason.by.staffBadge} size={14} pressable={false} className="ml-1 align-[-3px]" />}
            {label && <> · {label}</>}
          </span>
        </figcaption>
      </figure>
    )
  }
  // The card: compact, under a cover, with the person on top since nothing else there names them.
  return (
    <figure
      className={cn("relative rounded-lg border-l-[3px] bg-neutral-50 dark:bg-neutral-900/60 px-2.5 py-2", className)}
      style={{ borderLeftColor: accent }}
    >
      <figcaption className="mb-1 flex items-center gap-1.5 min-w-0">
        <CuratorAvatar person={reason.by} size={18} />
        <span className="min-w-0 truncate text-[11px]">
          {handle ? (
            <>
              <Link href={`/u/${handle}`} className="font-semibold hover:underline underline-offset-2">{name}</Link>
              {/* Only marks the role: the caption is cut short when long, which would clip its explanation. */}
              {reason.by.staffBadge && <StaffSeal kind={reason.by.staffBadge} size={13} pressable={false} className="ml-1 align-[-2px]" />}
            </>
          ) : (
            <span className="font-semibold">A reader</span>
          )}
          <span className="text-muted-foreground"> · {label ?? "Why you'd like it"}</span>
        </span>
      </figcaption>
      <blockquote className="whitespace-pre-line text-foreground/90 text-xs leading-relaxed">
        {reason.text}
      </blockquote>
    </figure>
  )
}

export default CuratorNote
