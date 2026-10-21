"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import moment from 'moment'
import { toast } from 'react-toastify'
import { Lock, MoreHorizontal, SmilePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BUDDY_READ_EMOJI, COMMENT_MAX, COMMENT_REPORT_REASONS, formatPercent, type SerializedComment, type UnlockedComment } from '@/lib/buddyReads'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import MemberAvatar from './MemberAvatar'
import CommentComposer from './CommentComposer'

interface CommentItemProps {
  comment: UnlockedComment
  buddyReadId: string
  viewerProgress: number
  isHost: boolean
  canPost: boolean
  onChange: () => void
  isReply?: boolean
}

const errorToast = (err: any, fallback: string) =>
  toast.error(err?.response?.data?.error || fallback, { position: "bottom-center" })

const chipClass = "h-7 inline-flex items-center gap-1 rounded-full px-2 text-sm tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const LockedReply: FC<{ stub: Extract<SerializedComment, { locked: true }> }> = ({ stub }) => (
  <p className="flex items-center gap-2 text-sm text-muted-foreground">
    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: stub.authorColour }} />
    <Lock size={13} aria-hidden /> A reply at {formatPercent(stub.position)}, once you get there
  </p>
)

const CommentItem: FC<CommentItemProps> = ({ comment, buddyReadId, viewerProgress, isHost, canPost, onChange, isReply }) => {
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body ?? "")
  const [busy, setBusy] = useState(false)
  const base = `/api/buddy-reads/${buddyReadId}/comments/${comment.id}`

  const react = (emoji: string) => {
    axios.post(`${base}/reactions`, { emoji }).then(onChange).catch((err) => errorToast(err, "Couldn't react. Try again."))
  }

  const saveEdit = () => {
    if (!draft.trim()) return
    setBusy(true)
    axios.patch(base, { body: draft }).then(() => { setEditing(false); onChange() })
      .catch((err) => errorToast(err, "Couldn't save your edit."))
      .finally(() => setBusy(false))
  }

  const remove = () => {
    if (!window.confirm(comment.mine ? "Delete your comment?" : "Delete this comment for everyone?")) return
    axios.delete(base).then(onChange).catch((err) => errorToast(err, "Couldn't delete that comment."))
  }

  const report = (reason: string) => {
    axios.post(`${base}/report`, { reason })
      .then(() => toast.success("Thanks. We'll take a look.", { position: "bottom-center" }))
      .catch((err) => errorToast(err, "Couldn't send the report."))
  }

  const where = [
    formatPercent(comment.position),
    comment.chapterLabel && `Ch. ${comment.chapterLabel}`,
    comment.pageLabel && `p. ${comment.pageLabel}`,
  ].filter(Boolean).join(" · ")

  const canModerate = comment.mine || isHost
  const canReport = !comment.mine

  if (comment.deleted) {
    return (
      <article className="flex flex-col gap-3">
        <p className="text-sm italic text-muted-foreground">This comment was deleted.</p>
        <Replies comment={comment} buddyReadId={buddyReadId} viewerProgress={viewerProgress} isHost={isHost} canPost={false} onChange={onChange} />
      </article>
    )
  }

  return (
    <article className="flex gap-3">
      <Link href={`/u/${comment.author?.username}`} className="shrink-0 self-start rounded-[30%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <MemberAvatar username={comment.author?.username ?? null} image={comment.author?.image ?? null} favColour={comment.author?.favColour ?? null} size={isReply ? 28 : 36} />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm leading-snug">
            <Link href={`/u/${comment.author?.username}`} className="font-semibold hover:underline underline-offset-4">{comment.mine ? "You" : comment.author?.username}</Link>
            <span className="text-muted-foreground"> · {moment(comment.createdAt).fromNow()}{comment.editedAt ? " · edited" : ""}</span>
            <br />
            <span className="text-xs text-muted-foreground tabular-nums">{where}</span>
          </p>

          {(canModerate || canReport) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Comment options" className="-mr-1 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <MoreHorizontal size={16} aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {comment.mine && <DropdownMenuItem onSelect={() => { setDraft(comment.body ?? ""); setEditing(true) }}>Edit</DropdownMenuItem>}
                {canModerate && <DropdownMenuItem onSelect={remove} className="text-rose-600 dark:text-rose-400">Delete</DropdownMenuItem>}
                {canReport && (
                  <>
                    {canModerate && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Report</DropdownMenuLabel>
                    {COMMENT_REPORT_REASONS.map((reason) => (
                      <DropdownMenuItem key={reason} onSelect={() => report(reason)}>{reason}</DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {editing ? (
          <div className="mt-2 flex flex-col gap-2">
            <label htmlFor={`edit-${comment.id}`} className="sr-only">Edit your comment</label>
            <textarea
              id={`edit-${comment.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={COMMENT_MAX}
              rows={3}
              autoFocus
              disabled={busy}
              className="w-full rounded-md border border-neutral-300 dark:border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} disabled={busy} className={secondaryButtonClass}>Cancel</button>
              <button type="button" onClick={saveEdit} disabled={busy || !draft.trim()} className={primaryButtonClass}>Save</button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{comment.body}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {comment.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => react(r.emoji)}
              aria-pressed={r.mine}
              aria-label={`${r.emoji} ${r.count}${r.mine ? ", including you" : ""}`}
              className={cn(chipClass, r.mine ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700")}
            >
              <span aria-hidden>{r.emoji}</span>{r.count}
            </button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Add a reaction" className={cn(chipClass, "text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800")}>
                <SmilePlus size={16} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="flex gap-1 p-1 min-w-0">
              {BUDDY_READ_EMOJI.map((e) => (
                <DropdownMenuItem key={e} onSelect={() => react(e)} className="text-xl px-2 justify-center" aria-label={`React ${e}`}>{e}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!isReply && canPost && !replying && (
            <button type="button" onClick={() => setReplying(true)} className="ml-1 text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Reply</button>
          )}
        </div>

        {!isReply && (
          <Replies comment={comment} buddyReadId={buddyReadId} viewerProgress={viewerProgress} isHost={isHost} canPost={canPost} onChange={onChange} />
        )}

        {replying && (
          <div className="mt-3">
            <CommentComposer
              buddyReadId={buddyReadId}
              progress={viewerProgress}
              parentId={comment.id}
              parentPosition={comment.position}
              onPosted={() => { setReplying(false); onChange() }}
              onCancel={() => setReplying(false)}
              autoFocus
            />
          </div>
        )}
      </div>
    </article>
  )
}

const Replies: FC<Omit<CommentItemProps, "isReply">> = ({ comment, ...rest }) => {
  if (comment.replies.length === 0) return null
  return (
    <ul className="mt-4 flex flex-col gap-4 border-l-2 border-neutral-200 dark:border-neutral-800 pl-4">
      {comment.replies.map((r) => (
        <li key={r.id}>
          {r.locked ? <LockedReply stub={r} /> : <CommentItem comment={r} {...rest} isReply />}
        </li>
      ))}
    </ul>
  )
}

export default CommentItem
