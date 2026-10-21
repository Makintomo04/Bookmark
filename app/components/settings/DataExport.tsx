"use client"
import { FC, useState } from 'react'
import { toast } from 'react-toastify'
import Link from 'next/link'
import { Download, FileUp, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import useEditProfileModal from '@/app/hooks/useEditProfileModal'

type Format = "json" | "csv"

const filenameFrom = (header: string | null, fallback: string) =>
  header?.match(/filename="?([^";]+)"?/)?.[1] ?? fallback

// Fetches the export and saves it, so a 401 or 429 shows a toast instead of downloading an error body.
const DataExport: FC<{ disabled?: boolean }> = ({ disabled }) => {
  const [pending, setPending] = useState<Format | null>(null)
  const { onClose } = useEditProfileModal()

  const download = async (format: Format) => {
    setPending(format)
    try {
      const res = await fetch(`/api/export?format=${format}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || "Couldn't export your data. Try again.")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filenameFrom(res.headers.get("Content-Disposition"), `bookmark-export.${format}`)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't export your data. Try again.", { position: "bottom-center" })
    } finally {
      setPending(null)
    }
  }

  const button = (format: Format, label: string) => (
    <Button type="button" variant="outline" disabled={disabled || pending !== null} onClick={() => download(format)} className="gap-2">
      {pending === format ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Download size={15} aria-hidden />}
      {label}
    </Button>
  )

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Your data</p>
        <p className="text-xs text-muted-foreground">Your data is yours: take it anywhere, anytime.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {button("json", "Download my data (JSON)")}
        {button("csv", "Export books (CSV)")}
        <Button asChild variant="outline" className="gap-2">
          <Link href="/import" onClick={onClose}><FileUp size={15} aria-hidden />Import from Goodreads or StoryGraph</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">The CSV uses Goodreads&apos; columns, so apps that import from Goodreads can read it.</p>
    </div>
  )
}

export default DataExport
