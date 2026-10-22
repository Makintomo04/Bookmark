"use client"
import { FC, useState } from 'react'
import { Code2 } from 'lucide-react'
import EmbedDialog from './EmbedDialog'

interface EmbedListButtonProps {
  id: string
  title: string
}

// "Embed" on a public list: opens copy-ready snippets for blogs, READMEs and forums.
const EmbedListButton: FC<EmbedListButtonProps> = ({ id, title }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Code2 size={16} aria-hidden />Embed
      </button>
      <EmbedDialog isOpen={open} onClose={() => setOpen(false)} target={{ kind: "list", id, title }} />
    </>
  )
}

export default EmbedListButton
