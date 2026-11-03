"use client"
import { FC, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { ArrowUp, Lock } from 'lucide-react'
import { notify, apiError } from '@/lib/notify'
import { COMMENT_MAX, LABEL_MAX, formatPercent } from '@/lib/buddyReads'
import { ClearableInput } from '@/app/components/ui/clearable-input'

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

const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// The input grows with what's typed up to about six lines, then scrolls.
const MAX_HEIGHT = 144

// A comment is pinned where the author is, so it stays hidden from anyone who hasn't got there.
// They can pull it earlier ("this is about chapter 3"), never later: the lock chip opens that control.
const CommentComposer: FC<CommentComposerProps> = ({ buddyReadId, progress, parentId, parentPosition, onPosted, onCancel, autoFocus }) => {
  const floor = parentPosition ?? 0
  const [body, setBody] = useState("")
  // Null until the author moves it, so it keeps following their progress as it updates.
  const [position, setPosition] = useState<number | null>(null)
  const [chapterLabel, setChapterLabel] = useState("")
  const [pageLabel, setPageLabel] = useState("")
  const [showPin, setShowPin] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isReply = !!parentId
  const pinned = Math.max(floor, Math.min(position ?? progress, progress))

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [body])

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
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-2">
      {showPin && (
        <div id={`${id}-pin`} className="flex flex-col gap-3 px-1 pb-1">
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
              <ClearableInput id={`${id}-chapter`} value={chapterLabel} onChange={(e) => setChapterLabel(e.target.value)} maxLength={LABEL_MAX} placeholder="e.g. 3" disabled={isSaving} className={inputClass} />
            </div>
            <div>
              <label htmlFor={`${id}-page`} className="text-xs font-medium text-muted-foreground">Page <span className="font-normal">· optional</span></label>
              <ClearableInput id={`${id}-page`} value={pageLabel} onChange={(e) => setPageLabel(e.target.value)} maxLength={LABEL_MAX} placeholder="in your edition" disabled={isSaving} className={inputClass} />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex min-h-11 min-w-0 flex-1 items-end gap-2 rounded-[22px] border border-neutral-300 bg-background py-1.5 pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-ring dark:border-neutral-700">
          <label htmlFor={id} className="sr-only">{isReply ? "Your reply" : "Add to the discussion"}</label>
          <textarea
            id={id}
            ref={inputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends with a keyboard and mouse; on a touch screen it's a new line and the button sends.
              const send = (e.metaKey || e.ctrlKey) || (!e.shiftKey && window.matchMedia("(pointer: fine)").matches)
              if (e.key === "Enter" && send && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
            }}
            maxLength={COMMENT_MAX}
            rows={1}
            autoFocus={autoFocus}
            placeholder={isReply ? "Reply…" : "Add to the discussion"}
            disabled={isSaving}
            className="min-w-0 flex-1 resize-none self-center bg-transparent py-1 text-[15px] leading-6 placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            aria-expanded={showPin}
            aria-controls={`${id}-pin`}
            aria-label={`Pinned at ${formatPercent(pinned)}, change`}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2.5 text-xs font-medium tabular-nums text-muted-foreground hover:text-foreground dark:bg-neutral-800"
          >
            <Lock size={11} strokeWidth={2.4} aria-hidden />{formatPercent(pinned)}
          </button>
        </div>
        <button
          type="submit"
          aria-label={isSaving ? "Posting" : isReply ? "Send reply" : "Send"}
          disabled={isSaving || !body.trim()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-fill text-white transition hover:bg-brand-fill-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowUp size={18} aria-hidden />
        </button>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={isSaving} className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Cancel
        </button>
      )}
    </form>
  )
}

export default CommentComposer
