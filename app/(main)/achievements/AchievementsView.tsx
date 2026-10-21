"use client"
import { FC, useState } from 'react'
import useAchievements from '@/app/hooks/useAchievements'
import AchievementsGrid, { GRID_COLUMNS } from '@/app/components/achievements/AchievementsGrid'
import AchievementDetail from '@/app/components/achievements/AchievementDetail'
import QuestDetail from '@/app/components/achievements/QuestDetail'
import { Skeleton } from '@/app/components/ui/skeleton'
import FetchErrorState from '@/app/components/FetchErrorState'

const AchievementsView: FC = () => {
  const { achievements, isLoading, isError, mutate } = useAchievements()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-40" />
        <div className={`${GRID_COLUMNS} gap-3`}>
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[5/6] w-full max-w-[120px] rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (isError || !Array.isArray(achievements)) {
    return <FetchErrorState error={isError} what="your achievements" onRetry={() => mutate()}/>
  }

  // Quest medals are one-offs, not rungs of a ladder, so they're counted apart.
  const milestones = achievements.filter((a) => !a.quest).flatMap((a) => a.milestones)
  const earnedCount = milestones.filter((m) => m.earned).length
  const selected = achievements.find((a) => a.key === selectedKey) ?? null

  return (
    <>
      <p className="-mt-5 mb-10 text-muted-foreground tabular-nums">
        {earnedCount} of {milestones.length} milestones earned. Select an achievement to see each milestone.
      </p>
      <AchievementsGrid achievements={achievements} onSelect={setSelectedKey} />
      {selected?.quest
        ? <QuestDetail achievement={selected} onClose={() => setSelectedKey(null)} />
        : <AchievementDetail achievement={selected} onClose={() => setSelectedKey(null)} />}
    </>
  )
}

export default AchievementsView
