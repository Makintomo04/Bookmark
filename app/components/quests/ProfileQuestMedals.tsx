
import { questMedals } from '@/lib/quests'
import QuestMedalShelf from './QuestMedalShelf'

// Someone's quest medals on their public profile, from the achievements already in its payload
// (lib/publicProfile.ts filters that payload for the viewer).
const ProfileQuestMedals = async ({ achievements }: { achievements: { key: string; earnedAt: string }[] }) => {
  const medals = await questMedals(achievements)
  return (
    <QuestMedalShelf
      medals={medals.map((m) => ({ slug: m.slug, title: m.title, design: { colour: m.colour, ribbon: m.ribbon, icon: m.icon }, earnedAt: m.earnedAt }))}
    />
  )
}

export default ProfileQuestMedals
