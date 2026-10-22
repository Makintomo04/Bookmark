"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { notify, apiError } from '@/lib/notify'
import { COMMENT_MAX, LABEL_MAX, formatPercent } from '@/lib/buddyReads'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'

interface CommentComposerProps {
  buddyReadId: string
  // Where the comment goes by default: the author's own progress.
  progress: number
  // For a reply: the parent's position, the lowest the reply can sit.
  parentId?: string
  parentPosition?: number
  onPosted: () => void
  onCancel?: () => void
  autoFocus?: boolean
}

const inputClass = "h-9 w-full rounded-md border border-neutral-300 dark:border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// A comment is pinned where the author is, so it stays hidden from anyone who hasn't got there.
// They can pull it earlier ("this is about chapter 3"), never later.
const CommentComposer: FC<CommentComposerProps> = ({ buddyReadId, progress, parentId, parentPosition, onPosted, onCancel, autoFocus }) => {
  const floor = parentPosition ?? 0
  const [body, setBody] = useState("")
  // Null until the author moves it, so it keeps following their progress as it updates.
  const [position, setPosition] = useState<number | null>(null)
  const [chapterLabel, setChapterLabel] = useState("")
  const [pageLabel, setPageLabel] = useState("")
  const [showPin, setShowPin] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const isReply = !!parentId
  const pinned = Math.max(floor, Math.min(position ?? progress, progress))

  const submit = () => {
    if (!body.trim() || isSaving) return
    setIsSaving(true)
    axios.post(`/api/buddy-reads/${buddyReadId}/comments`, {
      body,
      position: pinned,
      parentId,
      chapterLabel: chapterLabel || null,
      pageLabel: pageLabel || null,
    }).then(() => {
      setBody("")
      setChapterLabel("")
      setPageLabel("")
      setShowPin(false)
      setPosition(null)
      onPosted()
    }).catch((err) => {
      notify.error(apiError(err, "Couldn't post that. Check your connection and try again."))
    }).finally(() => setIsSaving(false))
  }

  const id = parentId ? `reply-${parentId}` : "new-comment"

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit() }}
      className="flex flex-col gap-3"
    >
      <label htmlFor={id} className="sr-only">{isReply ? "Your reply" : "Your comment"}</label>
      <textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() }
        }}
        maxLength={COMMENT_MAX}
        rows={isReply ? 2 : 3}
        autoFocus={autoFocus}
        placeholder={isReply ? "Reply…" : "What do you make of it so far?"}
        disabled={isSaving}
        className="w-full rounded-md border border-neutral-300 dark:border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
      />

      {showPin && (
        <div className="flex flex-col gap-3 rounded-lg bg-neutral-100 dark:bg-neutral-900 p-3">
          <div>
            <label htmlFor={`${id}-position`} className="flex items-baseline justify-between text-sm font-medium">
              <span>About this point in the book</span>
              <span className="tabular-nums">{formatPercent(pinned)}</span>
            </label>
            <input
              id={`${id}-position`}
              type="range"
              min={floor}
              max={Math.max(floor, progress)}
              step={0.5}
              value={pinned}
              onChange={(e) => setPosition(Number(e.target.value))}
              disabled={isSaving || progress <= floor}
              className="mt-2 w-full accent-current"
            />
            <p className="mt-1 text-xs text-muted-foreground">Readers see it once they reach {formatPercent(pinned)}. You can only pin it where you&apos;ve read up to.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${id}-chapter`} className="text-xs font-medium text-muted-foreground">Chapter <span className="font-normal">· optional</span></label>
              <input id={`${id}-chapter`} value={chapterLabel} onChange={(e) => setChapterLabel(e.target.value)} maxLength={LABEL_MAX} placeholder="e.g. 3" disabled={isSaving} className={inputClass} />
            </div>
            <div>
              <label htmlFor={`${id}-page`} className="text-xs font-medium text-muted-foreground">Page <span className="font-normal">· optional</span></label>
              <input id={`${id}-page`} value={pageLabel} onChange={(e) => setPageLabel(e.target.value)} maxLength={LABEL_MAX} placeholder="in your edition" disabled={isSaving} className={inputClass} />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          aria-expanded={showPin}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          🔒 Hidden until {formatPercent(pinned)}{showPin ? "" : " · change"}
        </button>
        <div className="flex gap-2">
          {onCancel && <button type="button" onClick={onCancel} disabled={isSaving} className={secondaryButtonClass}>Cancel</button>}
          <button type="submit" disabled={isSaving || !body.trim()} className={primaryButtonClass}>
            {isSaving ? "Posting…" : isReply ? "Reply" : "Post"}
          </button>
        </div>
      </div>
    </form>
  )
}

export default CommentComposer
