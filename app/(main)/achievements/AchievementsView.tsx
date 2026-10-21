"use client"
import { FC, useState } from 'react'
import useAchievements from '@/app/hooks/useAchievements'
import AchievementsGrid, { GRID_COLUMNS } from '@/app/components/achievements/AchievementsGrid'
import AchievementDetail from '@/app/components/achievements/AchievementDetail'
import { Skeleton } from '@/app/components/ui/skeleton'

const AchievementsView: FC = () => {
  const { achievements, isLoading, isError } = useAchievements()
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
    return <p className="text-muted-foreground">Couldn&apos;t load your achievements. Try refreshing the page.</p>
  }

  const milestones = achievements.flatMap((a) => a.milestones)
  const earnedCount = milestones.filter((m) => m.earned).length

  return (
    <>
      <p className="-mt-5 mb-10 text-muted-foreground tabular-nums">
        {earnedCount} of {milestones.length} milestones earned. Select an achievement to see each milestone.
      </p>
      <AchievementsGrid achievements={achievements} onSelect={setSelectedKey} />
      <AchievementDetail
        achievement={achievements.find((a) => a.key === selectedKey) ?? null}
        onClose={() => setSelectedKey(null)}
      />
    </>
  )
}

export default AchievementsView
