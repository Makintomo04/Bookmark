"use client"
import { FC, useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { secondaryButtonClass } from './ProfileHeader'
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

  return (
    <button type="button" onClick={share} className={cn(secondaryButtonClass, "max-sm:px-3")}>
      {copied ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
      {/* Icon-only on phones, where it shares a row with two other buttons. */}
      <span className="max-sm:sr-only">{copied ? "Copied" : "Share profile"}</span>
    </button>
  )
}

export default ShareProfileButton
