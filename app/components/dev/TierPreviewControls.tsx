"use client"
import { FC } from 'react'
import { cn } from '@/lib/utils'
import { READER_TIERS } from '@/lib/readerTier'
import { useTierPreview } from '@/app/hooks/useTierPreview'

const OPTIONS = [{ label: "Real count", booksRead: null }, { label: "No tier", booksRead: 0 }, ...READER_TIERS.map((t) => ({ label: t.label, booksRead: t.minBooks }))]

// Dev-only switch for how your own account's tier is shown across the app.
const TierPreviewControls: FC = () => {
  const { booksRead, setBooksRead } = useTierPreview()

  return (
    <section className="mt-8 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
      <h2 className="font-semibold">Preview my account as</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Changes only how your own avatar looks everywhere in the app (profile, header, feed, notifications, follower lists). Your data isn&apos;t touched, and it&apos;s saved in this browser only.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Preview tier">
        {OPTIONS.map((o) => {
          const active = booksRead === o.booksRead
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setBooksRead(o.booksRead)}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
                active ? "bg-foreground text-background border-foreground" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default TierPreviewControls
