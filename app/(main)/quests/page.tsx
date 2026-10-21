import { Metadata } from 'next'
import prisma from '@/lib/db'
import Container from '@/app/components/Container'
import QuestCard from '@/app/components/quests/QuestCard'
import { NewQuestButton } from '@/app/components/quests/QuestEditor'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { earnedCounts, goalText, listQuests, listTitles, medalOf } from '@/lib/quests'
import { questKey } from '@/lib/questRules'
import type { Quest } from '@prisma/client'

export const metadata: Metadata = {
  title: "Quests",
  description: "Seasonal reading quests on Bookmark: finish the challenge before it ends to earn a limited-edition medal.",
}

export const dynamic = "force-dynamic"

const Page = async () => {
  const viewer = await getCurrentUser()
  const { live, upcoming, ended } = await listQuests(viewer)
  const all = [...live, ...upcoming, ...ended]
  const [counts, titles, mine] = await Promise.all([
    earnedCounts(all.map((q) => q.id)),
    listTitles(all),
    viewer && all.length
      ? prisma.userAchievement.findMany({ where: { userId: viewer.id, key: { in: all.map((q) => questKey(q.id)) } }, select: { key: true } })
      : Promise.resolve([]),
  ])
  const earned = new Set(mine.map((m) => m.key))

  const section = (id: string, heading: string, quests: Quest[], empty?: string) => (quests.length > 0 || empty) && (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-xl font-bold">{heading}</h2>
      {quests.length === 0
        ? <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
        : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {quests.map((q) => (
              <QuestCard key={q.id} quest={{
                slug: q.slug,
                title: q.title,
                startsAt: q.startsAt,
                endsAt: q.endsAt,
                goalText: goalText(q, titles),
                design: medalOf(q),
                hidden: q.hidden,
                earnedCount: counts.get(q.id) ?? 0,
                earned: earned.has(questKey(q.id)),
              }} />
            ))}
          </div>
        )}
    </section>
  )

  return (
    <div className="mt-8 sm:mt-12 pb-24">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold">Quests</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              Seasonal reading challenges from the Bookmark team. Finish one before it ends to earn a limited-edition medal, yours for good.
              There&apos;s nothing to join: every book you finish during a quest counts.
            </p>
          </div>
          <NewQuestButton />
        </div>
        {section("live-heading", "On now", live, "No quest is running right now. The next one is never far off.")}
        {section("upcoming-heading", "Coming up", upcoming)}
        {section("ended-heading", "Past quests", ended)}
      </Container>
    </div>
  )
}

export default Page
