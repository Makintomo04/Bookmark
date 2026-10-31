"use client"
import { FC, useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { notify } from '@/lib/notify'
import { copyText } from '@/lib/copyText'

interface ShareProfileButtonProps {
  username: string
}

// Shares the profile link: the system share sheet where there is one (mostly phones), otherwise a copy.
const ShareProfileButton: FC<ShareProfileButtonProps> = ({ username }) => {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = `${window.location.origin}/u/${encodeURIComponent(username)}`
    const data = { title: `${username} on Bookmark`, text: `See what ${username} is reading on Bookmark`, url }

    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data)
        return
      } catch (err) {
        // Closing the share sheet isn't a failure, and needs no fallback.
        if (err instanceof DOMException && err.name === "AbortError") return
      }
    }

    try {
      await copyText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      notify.error("Couldn't copy the link.")
    }
  }

  const label = copied ? "Copied" : "Share profile"
  return (
    // An icon beside the display name, quiet until hovered; the label is for screen readers and the tooltip.
    <button type="button" onClick={share} aria-label={label} title={label}
      // 44px on touch screens (the design system's minimum), compact with a mouse.
      className="inline-flex size-11 pointer-fine:size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-neutral-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-neutral-800">
      {copied ? <Check size={18} aria-hidden /> : <Share2 size={18} aria-hidden />}
    </button>
  )
}

export default ShareProfileButton
