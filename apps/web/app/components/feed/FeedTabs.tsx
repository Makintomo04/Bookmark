"use client"
import { FC } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import useNotifications from '@/app/hooks/useNotifications'
import ActivityFeed from './ActivityFeed'
import NotificationsList from '../notifications/NotificationsList'
import { feedTabHref, type FeedTab } from '@/lib/feedTabs'

// The two halves of the feed: what the people you follow are reading, and what's addressed to you. Each
// tab is a link, so the one you're on survives a reload and the bell can point straight at Notifications.
// Only the open tab's list is on the page, so the notifications are marked read only when you look at them.
const FeedTabs: FC<{ tab: FeedTab }> = ({ tab }) => {
  const { unreadCount } = useNotifications()
  const tabs: { key: FeedTab; label: string; count?: number }[] = [
    { key: "following", label: "Following" },
    { key: "notifications", label: "Notifications", count: unreadCount },
  ]

  return (
    <>
      <nav role="tablist" aria-label="Feed" className="mb-4 grid grid-cols-2 border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={feedTabHref(t.key)}
            scroll={false}
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`feed-${t.key}`}
            className={cn(
              "-mb-px inline-flex h-10 items-center justify-center gap-1.5 border-b-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-fill px-1 text-[11px] font-semibold leading-none tabular-nums text-white">
                <span className="sr-only">, </span>{t.count > 9 ? "9+" : t.count}<span className="sr-only"> unread</span>
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div id={`feed-${tab}`} role="tabpanel">
        {tab === "notifications" ? <NotificationsList /> : <ActivityFeed />}
      </div>
    </>
  )
}

export default FeedTabs
