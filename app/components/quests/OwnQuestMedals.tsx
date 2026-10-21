"use client"
import { FC } from 'react'
import useAchievements from '@/app/hooks/useAchievements'
import QuestMedalShelf from './QuestMedalShelf'

// Your own quest medals, from the achievements the profile header already loads.
const OwnQuestMedals: FC = () => {
  const { achievements } = useAchievements()
  const medals = achievements
    .filter((a) => a.quest && a.milestones[0]?.earned)
    .sort((a, b) => (b.milestones[0].earnedAt ?? "").localeCompare(a.milestones[0].earnedAt ?? ""))
    .map((a) => ({ slug: a.quest!.slug, title: a.title, design: a.quest!, earnedAt: a.milestones[0].earnedAt }))
  return <QuestMedalShelf medals={medals} title="Your quest medals" />
}

export default OwnQuestMedals
