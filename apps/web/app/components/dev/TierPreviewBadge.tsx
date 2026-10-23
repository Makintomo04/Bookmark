"use client"
import { FC, useEffect, useState } from 'react'
import Link from 'next/link'
import { getReaderTier } from '@/lib/readerTier'
import { tierPreviewEnabled, useTierPreview } from '@/app/hooks/useTierPreview'

// A reminder pinned to the corner while a dev tier preview is on, so it isn't mistaken for real data.
const TierPreviewBadge: FC = () => {
  const { booksRead, setBooksRead } = useTierPreview()
  // The preview lives in localStorage, so only show this after mounting to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!tierPreviewEnabled || !mounted || booksRead === null) return null
  const label = getReaderTier(booksRead)?.label ?? "No tier"

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-3 rounded-full bg-foreground py-1.5 pl-4 pr-1.5 text-sm text-background shadow-lg">
      <Link href="/dev/tiers" className="hover:underline">Previewing {label} tier</Link>
      <button type="button" onClick={() => setBooksRead(null)} className="rounded-full bg-background/15 px-3 py-1 font-medium hover:bg-background/25">
        Reset
      </button>
    </div>
  )
}

export default TierPreviewBadge
