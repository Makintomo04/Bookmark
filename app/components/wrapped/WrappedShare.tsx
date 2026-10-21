"use client"
import { FC, useState } from 'react'
import { Download, Link2, Share2 } from 'lucide-react'

interface WrappedShareProps {
  // Site-relative: the public Wrapped page, and its 1080×1920 story image.
  shareUrl: string
  storyUrl: string
  fileName: string
  title: string
}

const button = 'inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'

const WrappedShare: FC<WrappedShareProps> = ({ shareUrl, storyUrl, fileName, title }) => {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = new URL(shareUrl, window.location.origin).toString()
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch (e) {
        // Closing the share sheet isn't an error worth falling back from.
        if ((e as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <a href={storyUrl} download={fileName} className={`${button} bg-white text-neutral-900 hover:bg-neutral-200`}>
        <Download size={16} aria-hidden /> Download story image
      </a>
      <button type="button" onClick={share} className={`${button} border border-white/40 hover:bg-white/10`}>
        {copied ? <Link2 size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
        <span aria-live="polite">{copied ? 'Link copied' : 'Share link'}</span>
      </button>
    </div>
  )
}

export default WrappedShare
