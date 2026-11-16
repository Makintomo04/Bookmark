"use client"
import { FC, useState } from 'react'
import type { Book } from '@prisma/client'
import { Check, Globe, Lock, MoreHorizontal, Share, Users } from 'lucide-react'
import useBooks from '@/app/hooks/useBooks'
import useSettings, { type Settings } from '@/app/hooks/useSettings'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { SHELF_STATUS, SHELF_TITLE, type ShelfKey } from '@/lib/shelfFilter'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'

// The setting that keeps each shelf to the reader (packages/shared/src/privacyRules.ts). Paused books go with
// Reading. Did not finish and Will not read are never shown to anyone else, so they have no switch.
const SHELF_SETTING: Partial<Record<ShelfKey, "hideReading" | "hideFinished" | "hideWantToRead">> = {
  reading: "hideReading",
  paused: "hideReading",
  finished: "hideFinished",
  want: "hideWantToRead",
}

const iconButton = "grid size-10 place-items-center rounded-full border border-neutral-300 dark:border-neutral-700 text-foreground transition hover:bg-neutral-100 dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"

// Who sees this shelf, in the words a reader would use: their own choice for the shelf, then the profile's.
function audience(settings: Settings, key: (typeof SHELF_SETTING)[ShelfKey] | undefined) {
  if (!key || settings[key]) return { label: "Only you", Icon: Lock }
  if (settings.profileVisibility !== "PUBLIC") return { label: "Followers only", Icon: Users }
  return { label: "Public", Icon: Globe }
}

// Your shelf's own page, at a glance (BOO-92): how many books, who can see it, a share link, and the switch
// that keeps it to yourself. Making it private acts straight away and offers Undo, as the app does everywhere.
const ShelfHeader: FC<{ shelf: ShelfKey, username: string }> = ({ shelf, username }) => {
  const { books } = useBooks()
  const { settings, save, pending } = useSettings()
  const [copied, setCopied] = useState(false)
  const key = SHELF_SETTING[shelf]
  const count = Array.isArray(books) ? (books as Book[]).filter((b) => b.status === SHELF_STATUS[shelf]).length : null
  const seen = settings ? audience(settings, key) : null
  const hidden = !!(settings && key && settings[key])
  const title = SHELF_TITLE[shelf]

  const share = async () => {
    const url = window.location.href.split("?")[0]
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: `${username}'s ${title} on Bookmark`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Share sheet dismissed, or clipboard blocked: nothing to do.
    }
  }

  const setPrivate = (next: boolean) => {
    if (!key) return
    save(key, next)
    notify.success(next ? `${title} is now private` : `${title} is visible again`, {
      description: next ? "Only you can see it." : undefined,
      action: { label: "Undo", onClick: () => save(key, !next) },
    })
  }

  return (
    <header className="mt-2 mb-8 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <h1 className="page-title break-words">{title}</h1>
        <div className="flex shrink-0 gap-2 pt-1">
          {/* Sharing a shelf only you can see would send a link that says it's not there. */}
          {!hidden && (
            <button type="button" onClick={share} aria-label={copied ? "Link copied" : `Share your ${title} shelf`} className={iconButton}>
              {copied ? <Check size={18} aria-hidden /> : <Share size={18} aria-hidden />}
            </button>
          )}
          {key && (
            <DropdownMenu>
              <DropdownMenuTrigger aria-label={`More options for ${title}`} disabled={!settings || pending !== null} className={iconButton}>
                <MoreHorizontal size={18} aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setPrivate(!hidden)} className="cursor-pointer gap-2">
                  {hidden ? <Globe size={15} aria-hidden /> : <Lock size={15} aria-hidden />}
                  {hidden ? "Make visible" : "Make private"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", count === null && "invisible")}>
        <span className="tabular-nums">{count === null ? "0 books" : `${count.toLocaleString('en-GB')} ${count === 1 ? "book" : "books"}`}</span>
        {seen && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1"><seen.Icon size={14} aria-hidden />{seen.label}</span>
          </>
        )}
      </p>
    </header>
  )
}

export default ShelfHeader
