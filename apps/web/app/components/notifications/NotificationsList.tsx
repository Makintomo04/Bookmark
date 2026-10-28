"use client"
import { FC, useEffect, useRef } from 'react'
import Link from 'next/link'
import axios from 'axios'
import useSWRInfinite from 'swr/infinite'
import { mutate as revalidate } from 'swr'
import { fetcher } from '@/lib/fetcher'
import { cn } from '@/lib/utils'
import Loader from '../Loader'
import FetchErrorState from '../FetchErrorState'
import { pillClass } from '../books/ShelfToolbar'
import { NotificationAvatar, NotificationText, notificationHref, useNotificationActions, type NotificationLike } from './NotificationParts'

const PAGE = 30

type Page = { notifications: (NotificationLike & { id: string; createdAt: string; read: boolean })[]; unreadCount: number; hasMore: boolean }

// Each page carries on from the last one's oldest notification.
const pageKey = (index: number, previous: Page | null) => {
  if (index === 0) return `/api/notifications?limit=${PAGE}`
  if (!previous?.hasMore) return null
  const last = previous.notifications[previous.notifications.length - 1]
  return `/api/notifications?limit=${PAGE}&after=${last.id}`
}

// Every notification, newest first, a page at a time, with the same actions as the bell's menu. Opening
// the page reads them all, as opening the menu does; the ones that were new keep their dot until you leave.
const NotificationsList: FC = () => {
  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<Page>(pageKey, fetcher, { revalidateOnFocus: false })
  const marked = useRef(false)
  const refresh = () => { mutate(); revalidate('/api/notifications') }
  const { addRecommended, answerRequest } = useNotificationActions(refresh)

  const first = data?.[0]
  useEffect(() => {
    if (!first || marked.current || first.unreadCount === 0) return
    marked.current = true
    // The bell's badge clears; this list keeps showing which ones were new.
    axios.patch("/api/notifications", { all: true }).then(() => revalidate('/api/notifications'))
  }, [first])

  if (error) return <FetchErrorState error={error} what="your notifications" onRetry={() => mutate()} />
  if (!data) return <Loader />

  const all = data.flatMap((p) => p.notifications)
  const hasMore = data[data.length - 1]?.hasMore
  const loadingMore = isValidating && size > data.length
  const buttonClass = "h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  if (all.length === 0) {
    return <p className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet. Follows, recommendations, circle invites and medals show up here.</p>
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {all.map((n) => (
          <li key={n.id} className="py-1">
            <Link href={notificationHref(n)}
              className="relative flex items-center gap-3 rounded-lg p-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <NotificationAvatar actor={n.actor} />
              <NotificationText n={n} full />
              {!n.read && <span aria-label="New" className="ml-auto size-2 shrink-0 rounded-full bg-brand-fill" />}
            </Link>
            {n.type === "BOOK_RECOMMENDED" && n.book && !n.book.onShelf && (
              <div className="flex gap-2 pl-14 pb-2">
                <button type="button" onClick={() => addRecommended(n.id)} className={cn(buttonClass, "underline underline-offset-2 hover:bg-neutral-100 dark:hover:bg-neutral-900")}>
                  Add to Want to read
                </button>
              </div>
            )}
            {n.type === "FOLLOW_REQUEST" && (
              <div className="flex gap-2 pl-14 pb-2">
                <button type="button" onClick={() => answerRequest(n.actor.username, "accept")} aria-label={`Accept ${n.actor.username}'s request`} className={cn(buttonClass, "bg-foreground text-background hover:opacity-90")}>
                  Accept
                </button>
                <button type="button" onClick={() => answerRequest(n.actor.username, "decline")} aria-label={`Decline ${n.actor.username}'s request`} className={cn(buttonClass, "border border-border hover:bg-neutral-100 dark:hover:bg-neutral-900")}>
                  Decline
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button type="button" disabled={loadingMore} onClick={() => setSize(size + 1)} className={pillClass}>
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </>
  )
}

export default NotificationsList
