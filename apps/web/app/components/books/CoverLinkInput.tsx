"use client"
import { FC, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'

// "Or paste an image link", beside a cover's upload button. The server copies the image to our storage
// (app/api/covers/from-link) and hands back its address, which the form then uses like an upload.
const CoverLinkInput: FC<{ onCopied: (url: string) => void, disabled?: boolean }> = ({ onCopied, disabled }) => {
  const [link, setLink] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const use = async () => {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/covers/from-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: link }) })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) throw new Error(data?.error ?? "Couldn't use that link. Try again.")
      onCopied(data.url)
      setLink('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Cover image link</span>
          <ClearableInput
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (link.trim()) void use() } }}
            placeholder="Or paste an image link (https://…)"
            autoComplete="off"
            disabled={disabled || pending}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          />
        </label>
        <Button type="button" variant="outline" onClick={use} disabled={disabled || pending || !link.trim()}>
          {pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Use link
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export default CoverLinkInput
