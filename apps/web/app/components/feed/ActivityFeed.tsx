"use client"
import { FC } from 'react'
import Link from 'next/link'
import useSWRInfinite from 'swr/infinite'
import { fetcher, swrOptions } from '@/lib/fetcher'
import Loader from '../Loader'
import FetchErrorState from '../FetchErrorState'
import { pillClass } from '../books/ShelfToolbar'
import ActivityFeedItem, { ActivityFeedItemData } from './ActivityFeedItem'
import { FeedEmpty, FeedList } from './FeedRow'
import PeopleYouMayKnow from '../people/PeopleYouMayKnow'

const PAGE = 20

type Page = { activities: ActivityFeedItemData[]; hasMore: boolean; next: string | null }

// Each page carries on from the cursor the last one sent.
const pageKey = (index: number, previous: Page | null) => {
  if (index === 0) return `/api/feed?limit=${PAGE}`
  if (!previous?.hasMore || !previous.next) return null
  return `/api/feed?limit=${PAGE}&after=${previous.next}`
}

// What the people you follow are reading, newest first, a page at a time.
const ActivityFeed: FC = () => {
  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<Page>(pageKey, fetcher, { ...swrOptions, revalidateOnFocus: false })

  if (error) return <FetchErrorState error={error} what="your feed" onRetry={() => mutate()} />
  if (!data) return <Loader notScreen />

  const all = data.flatMap((p) => p.activities)
  const hasMore = data[data.length - 1]?.hasMore
  const loadingMore = isValidating && size > data.length

  // While you follow only a few people, suggestions sit above the feed (BOO-81). Nothing shows otherwise.
  const suggestions = <PeopleYouMayKnow variant="feed" className="mb-6" />

  if (all.length === 0) {
    return <>{suggestions}<FeedEmpty>No activity yet. Follow some readers from <Link href="/discover" className="underline">Discover</Link> to see what they&apos;re reading here.</FeedEmpty></>
  }

  return (
    <>
      {suggestions}
      <FeedList>
        {all.map((activity) => (
          <ActivityFeedItem key={activity.id} activity={activity} />
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

export default ActivityFeed
