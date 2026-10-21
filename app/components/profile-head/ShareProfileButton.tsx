"use client"
import { FC, useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { cn } from '@/lib/utils'
import { secondaryButtonClass } from './ProfileHeader'

interface ShareProfileButtonProps {
  username: string
}

// Some in-app browsers and webviews refuse the async clipboard; the old selection copy still works there.
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const field = document.createElement("textarea")
    field.value = text
    field.setAttribute("readonly", "")
    field.style.position = "fixed"
    field.style.opacity = "0"
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand("copy")
    field.remove()
    if (!ok) throw new Error("copy failed")
  }
}

// Opens the system share sheet where there is one (mostly phones), otherwise copies the link.
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
      toast.success("Profile link copied.", { position: "bottom-center" })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy the link.", { position: "bottom-center" })
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
