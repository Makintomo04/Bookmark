"use client"
import { FC } from 'react'
import moment from 'moment'
import axios from 'axios'
import { mutate as revalidate } from 'swr'
import { getAchievementTitle } from '@/lib/achievements-catalog'
import { notify } from '@/lib/notify'
import { refreshAfterBookChange } from '@/app/hooks/refreshAfterBookChange'
import { reviewHiddenMessage } from '@/lib/reviewReports'

// One notification as /api/notifications sends it, shared by the bell's menu and the feed page's
// Notifications tab. The avatar is the feed's ActorAvatar.

export type NotificationLike = {
  id?: string
  type: string
  createdAt?: string
  read?: boolean
  message?: string | null
  achievementKey?: string | null
  count?: number | null
  buddyRead?: { id: string; title: string; inviteCode: string; status?: string } | null
  book?: { id: string; title: string; author: string; coverImage: string; onShelf: boolean; href?: string | null } | null
  actor: { username: string; image?: string | null; favColour?: string | null }
}

export const notificationCopy = (n: NotificationLike) => {
  const others = (n.count ?? 1) - 1
  const book = n.buddyRead?.title ?? "a book"
  switch (n.type) {
    case "NEW_FOLLOWER": return "started following you"
    case "ACHIEVEMENT_EARNED": return `reached the "${getAchievementTitle(n.achievementKey ?? "")}" milestone`
    case "BUDDY_READ_INVITE": return `invited you to read ${book} together`
    case "BOOK_RECOMMENDED": return `thinks you'd like ${n.book?.title ?? "a book"}`
    case "BUDDY_READ_JOINED": return `${others > 0 ? `and ${others} ${others === 1 ? "other" : "others"} ` : ""}joined your reading circle for ${book}`
    case "BUDDY_READ_HOSTED": return `handed you the reading circle for ${book}. You're the host now`
    case "FOLLOW_REQUEST": return "asked to follow you"
    default: return "did something"
  }
}

export const notificationHref = (n: NotificationLike) => {
  if (n.type === "ACHIEVEMENT_EARNED") return "/achievements"
  if (n.type === "REVIEW_HIDDEN" && n.book?.href) return `${n.book.href}#reviews-heading`
  if (n.type === "BUDDY_READ_INVITE" && n.buddyRead) return `/circles/join/${n.buddyRead.inviteCode}`
  if (n.buddyRead) return `/circles/${n.buddyRead.id}`
  return `/u/${encodeURIComponent(n.actor.username)}`
}

// What happened and when. `full` lets the line wrap (the page) instead of cutting it short (the menu).
export const NotificationText: FC<{ n: NotificationLike; full?: boolean }> = ({ n, full = false }) => {
  const oneLine = full ? "" : "truncate"
  return (
    <div className="min-w-0">
      {n.type === "COMMENTS_UNLOCKED" ? (
        // Not one person's doing: "3 comments to read in Dune", reached or newly posted.
        <p className={`text-sm ${oneLine}`}>{n.count ?? 1} {n.count === 1 ? "comment" : "comments"} to read in <span className="font-semibold">{n.buddyRead?.title ?? "your reading circle"}</span></p>
      ) : n.type === "REVIEW_HIDDEN" ? (
        // Moderation, so nobody is named: not the reporter, not the librarian.
        // Never cut short: the last line is how to appeal.
        <p className="text-sm">{reviewHiddenMessage(n.book?.title ?? null)}</p>
      ) : n.type === "BUDDY_READ_HOST_INHERITED" ? (
        // The old host closed their account, so there's nobody to name.
        <p className={`text-sm ${full ? "" : "line-clamp-2"}`}>
          {n.buddyRead?.status === "ARCHIVED"
            ? <>The host of <span className="font-semibold">{n.buddyRead?.title ?? "a reading circle"}</span> closed their account. It&apos;s yours now, archived until you have room to reopen it.</>
            : <>You&apos;re now hosting <span className="font-semibold">{n.buddyRead?.title ?? "a reading circle"}</span>: its host closed their account.</>}
        </p>
      ) : (
        <p className={`text-sm ${oneLine}`}><span className="font-semibold">{n.actor.username}</span> {notificationCopy(n)}</p>
      )}
      {n.type === "BOOK_RECOMMENDED" && n.message && (
        <p className={`text-xs text-muted-foreground italic ${full ? "" : "line-clamp-2"}`}>&ldquo;{n.message}&rdquo;</p>
      )}
      <p className="text-xs text-muted-foreground">{moment(n.createdAt).fromNow()}</p>
      {n.type === "BOOK_RECOMMENDED" && n.book?.onShelf && (
        <p className="mt-1 text-xs text-muted-foreground">On your shelf</p>
      )}
    </div>
  )
}

// The actions a notification can carry: add a recommended book, answer a follow request. `refresh`
// reloads the notifications afterwards.
export function useNotificationActions(refresh: () => void) {
  const addRecommended = (id: string) => {
    axios.post(`/api/recommendations/${id}`).then(({ data }) => {
      notify.success(data.added ? "Added to Want to read" : "Already on your shelf")
      refreshAfterBookChange()
    }).catch((err) => {
      notify.error((axios.isAxiosError(err) && err.response?.data?.error) || "Couldn't add that book")
    })
  }

  // Settings → Privacy lists every request as well.
  const answerRequest = (username: string, action: "accept" | "decline") => {
    axios.post(`/api/follow-requests/from/${encodeURIComponent(username)}`, { action }).then(({ data }) => {
      if (data.accepted) notify.success(`${username} can now see your profile.`)
    }).catch((err) => {
      notify.error((axios.isAxiosError(err) && err.response?.data?.error) || "Couldn't answer that request. Try again.")
    }).finally(() => {
      refresh()
      // The list on your profile and in Settings.
      revalidate('/api/follow-requests')
    })
  }

  return { addRecommended, answerRequest }
}
