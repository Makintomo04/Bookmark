"use client"
import { FC } from 'react'
import useFeed from '@/app/hooks/useFeed'
import Loader from '../Loader'
import ActivityFeedItem, { ActivityFeedItemData } from './ActivityFeedItem'
import Link from 'next/link'
import FetchErrorState from '../FetchErrorState'

interface ActivityFeedProps {

}

const ActivityFeed: FC<ActivityFeedProps> = ({}) => {
  const { activities, isLoading, isError, mutate } = useFeed()

  if (isLoading) return <Loader notScreen/>
  if (isError) return <FetchErrorState error={isError} what="your feed" onRetry={() => mutate()}/>

  if (!activities || activities.length === 0) {
    return <p className='text-sm text-muted-foreground'>No activity yet. Follow some readers from <Link href="/discover" className='underline'>Discover</Link> to see what they&apos;re reading here.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {activities.map((activity: ActivityFeedItemData) => (
        <ActivityFeedItem key={activity.id} activity={activity}/>
      ))}
    </div>
  )
}

export default ActivityFeed
