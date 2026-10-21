"use client"
import { FC, useState } from 'react'
import { Check, Code2, Link2, Share2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { cn } from '@/lib/utils'
import { secondaryButtonClass } from './ProfileHeader'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import EmbedDialog from '../embed/EmbedDialog'
import { copyText } from '../embed/copyText'

interface ShareProfileButtonProps {
  username: string
  // False when the embed would show "not available" (the owner's own non-public profile); the dialog says so.
  embeddable?: boolean
}

// The share menu: share the link (the system share sheet where there is one, mostly phones,
// otherwise a copy), or get embed snippets for a README, blog or forum signature.
const ShareProfileButton: FC<ShareProfileButtonProps> = ({ username, embeddable = true }) => {
  const [copied, setCopied] = useState(false)
  const [embedOpen, setEmbedOpen] = useState(false)

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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(secondaryButtonClass, "max-sm:px-3")}>
            {copied ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
            {/* Icon-only on phones, where it shares a row with two other buttons. */}
            <span className="max-sm:sr-only">{copied ? "Copied" : "Share profile"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={share} className="gap-2">
            <Link2 size={14} aria-hidden />Share link
          </DropdownMenuItem>
          {/* After the menu has closed and handed focus back, so the dialog keeps it. */}
          <DropdownMenuItem onSelect={() => setTimeout(() => setEmbedOpen(true), 0)} className="gap-2">
            <Code2 size={14} aria-hidden />Embed on your site
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EmbedDialog isOpen={embedOpen} onClose={() => setEmbedOpen(false)} target={{ kind: "profile", username }} available={embeddable} />
    </>
  )
}

export default ShareProfileButton
