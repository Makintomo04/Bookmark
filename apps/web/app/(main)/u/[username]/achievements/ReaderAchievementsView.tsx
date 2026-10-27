"use client"
import { FC, useState } from 'react'
import type { PublicAchievements } from '@/lib/publicProfile'
import AchievementDetail from '@/app/components/achievements/AchievementDetail'
import MedalList from '@/app/components/achievements/MedalList'
import ReaderTierCard from '@/app/components/achievements/ReaderTierCard'

// Someone else's achievements, read-only: the same sections as /achievements, fed from the server, without
// Up next (that's for your own reading).
const ReaderAchievementsView: FC<{ data: PublicAchievements }> = ({ data }) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = data.ladders.find((a) => a.key === selectedKey) ?? null

  return (
    <div className="flex flex-col gap-10">
      <ReaderTierCard achievements={data.ladders} reader={{ username: data.username, booksRead: data.booksRead }} />
      <MedalList achievements={data.ladders} onSelect={setSelectedKey} heading="Medals" readOnly />
      <AchievementDetail achievement={selected} onClose={() => setSelectedKey(null)} readOnly />
    </div>
  )
}

export default ReaderAchievementsView
