"use client"
import { FC, useState } from 'react'
import useAchievements from '@/app/hooks/useAchievements'
import AchievementDetail from '@/app/components/achievements/AchievementDetail'
import MedalList from '@/app/components/achievements/MedalList'
import UpNext from '@/app/components/achievements/UpNext'
import { Skeleton } from '@/app/components/ui/skeleton'
import FetchErrorState from '@/app/components/FetchErrorState'
import ReaderTierCard from '@/app/components/achievements/ReaderTierCard'

// Top to bottom: the reader's tier, the three rungs they're closest to, then every medal.
const AchievementsView: FC = () => {
  const { achievements, isLoading, isError, mutate } = useAchievements()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-10">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (isError || !Array.isArray(achievements)) {
    return <FetchErrorState error={isError} what="your achievements" onRetry={() => mutate()}/>
  }

  const selected = achievements.find((a) => a.key === selectedKey) ?? null

  return (
    <div className="flex flex-col gap-10">
      <ReaderTierCard achievements={achievements} />
      <UpNext achievements={achievements} onSelect={setSelectedKey} />
      <MedalList achievements={achievements} onSelect={setSelectedKey} />
      <AchievementDetail achievement={selected} onClose={() => setSelectedKey(null)} />
    </div>
  )
}

export default AchievementsView
