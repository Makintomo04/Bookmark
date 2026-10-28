"use client"
import { FC, useEffect, useRef } from 'react'
import { readerName } from '@/lib/profile'
import axios from 'axios'
import useSWRInfinite from 'swr/infinite'
import { mutate as revalidate } from 'swr'
import { fetcher } from '@/lib/fetcher'
import { cn } from '@/lib/utils'
import Loader from '../Loader'
import FetchErrorState from '../FetchErrorState'
import { pillClass } from '../books/ShelfToolbar'
import { FeedEmpty, FeedList, FeedRow } from '../feed/FeedRow'
import { NotificationLead, NotificationText, notificationHref, useNotificationActions, type NotificationLike } from './NotificationParts'

const PAGE = 30

type Page = { notifications: (NotificationLike & { id: string; createdAt: string; read: boolean })[]; unreadCount: number; hasMore: boolean }

// Each page carries on from the last one's oldest notification.
const pageKey = (index: number, previous: Page | null) => {
  if (index === 0) return `/api/notifications?limit=${PAGE}`
  if (!previous?.hasMore) return null
  const last = previous.notifications[previous.notifications.length - 1]
  return `/api/notifications?limit=${PAGE}&after=${last.id}`
}

// Every notification, newest first, a page at a time, with the same actions as the bell's menu. Showing
// the list reads them all, as opening the menu does; the ones that were new keep their dot until you leave.
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
  if (!data) return <Loader notScreen />

  const all = data.flatMap((p) => p.notifications)
  const hasMore = data[data.length - 1]?.hasMore
  const loadingMore = isValidating && size > data.length
  const buttonClass = "h-8 px-3 rounded-full text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  if (all.length === 0) {
    return <FeedEmpty>No notifications yet. Follows, recommendations, circle invites, medals and new books in your series show up here.</FeedEmpty>
  }

  const actionsFor = (n: Page["notifications"][number]) => {
    if (n.type === "BOOK_RECOMMENDED" && n.book && !n.book.onShelf) {
      return (
        <button type="button" onClick={() => addRecommended(n.id)} className={cn(buttonClass, "underline underline-offset-2 hover:bg-neutral-100 dark:hover:bg-neutral-900")}>
          Add to Want to read
        </button>
      )
    }
    if (n.type === "FOLLOW_REQUEST") {
      return (
        <>
          <button type="button" onClick={() => answerRequest(n.actor.username, "accept")} aria-label={`Accept ${readerName(n.actor)}'s request`} className={cn(buttonClass, "bg-foreground text-background hover:opacity-90")}>
            Accept
          </button>
          <button type="button" onClick={() => answerRequest(n.actor.username, "decline")} aria-label={`Decline ${readerName(n.actor)}'s request`} className={cn(buttonClass, "border border-border hover:bg-neutral-100 dark:hover:bg-neutral-900")}>
            Decline
          </button>
        </>
      )
    }
    return null
  }

  return (
    <>
      <FeedList>
        {all.map((n) => (
          <FeedRow key={n.id} href={notificationHref(n)} actions={actionsFor(n)}>
            <NotificationLead n={n} />
            <NotificationText n={n} full />
            {!n.read && <span aria-label="New" className="ml-auto size-2 shrink-0 rounded-full bg-brand-fill" />}
          </FeedRow>
        ))}
      </FeedList>
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
