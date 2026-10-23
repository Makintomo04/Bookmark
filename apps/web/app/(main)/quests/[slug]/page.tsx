import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, EyeOff } from 'lucide-react'
import Container from '@/app/components/Container'
import BookCover from '@/app/components/cards/BookCover'
import QuestMedal from '@/app/components/achievements/QuestMedal'
import { EditQuestButton } from '@/app/components/quests/QuestEditor'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { findQuest, goalText, questDetail } from '@/lib/quests'
import { PAGES_SANITY_MAX, questCountdown, questDates, questDay, toEditableQuest } from '@/lib/questRules'

interface PageProps {
  params: { slug: string }
}

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // Staff can open drafts, so the title follows what the page itself shows; drafts stay out of search.
  const quest = await findQuest(params.slug, await getCurrentUser())
  if (!quest) return { title: "Quest not found", robots: { index: false } }
  return { title: quest.title, description: quest.description.slice(0, 200), ...(quest.hidden && { robots: { index: false } }) }
}

const Page = async ({ params }: PageProps) => {
  const viewer = await getCurrentUser()
  const detail = await questDetail(params.slug, viewer)
  if (!detail) notFound()
  const { quest, goal, phase, design, titles, standing, earnedAt, earnedCount } = detail
  const readers = `${earnedCount.toLocaleString("en-GB")} ${earnedCount === 1 ? "reader" : "readers"}`
  const percent = standing ? Math.min(100, Math.round((standing.count / standing.target) * 100)) : 0

  return (
    <div className="mt-6 sm:mt-10 pb-24">
      <Container className="flex flex-col gap-10">
        <Link href="/quests" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} aria-hidden />All quests
        </Link>

        <header
          className="relative flex flex-col sm:flex-row sm:items-center gap-6 overflow-hidden rounded-2xl p-6 sm:p-8 text-white"
          style={{ background: `radial-gradient(circle at 90% 10%, rgb(255 255 255 / 0.16), transparent 55%), linear-gradient(135deg, ${design.ribbon}, ${design.colour})` }}
        >
          <QuestMedal design={design} earned className="w-28 sm:w-36 shrink-0 drop-shadow-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/75">
              Seasonal quest · {questDates(quest.startsAt, quest.endsAt)}
            </p>
            <h1 className="page-title mt-2">{quest.title}</h1>
            <p className="mt-3 max-w-2xl text-white/85 whitespace-pre-line">{quest.description}</p>
            <p className="mt-4 text-sm font-medium">
              {phase === "ended"
                ? `Ended: ${readers} earned this`
                : phase === "upcoming"
                  ? questCountdown(quest)
                  : `${questCountdown(quest)} · ${readers} earned it so far`}
            </p>
          </div>
        </header>

        {quest.hidden && (
          <p className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 dark:bg-neutral-900 px-4 py-3 text-sm text-muted-foreground">
            <EyeOff size={14} aria-hidden />Draft: only the Bookmark team can see this quest, and nobody can earn it yet.
          </p>
        )}
        <div><EditQuestButton quest={toEditableQuest(quest)} /></div>

        <section aria-labelledby="goal-heading" className="grid gap-8 md:grid-cols-[1fr_20rem]">
          <div>
            <h2 id="goal-heading" className="text-xl font-bold">The goal</h2>
            <p className="mt-2 text-lg">{goalText(quest, titles) || "This quest has no goal set."}</p>
            {goal?.type === "list" && (
              <Link href={`/lists/${goal.listId}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
                See the list <ArrowRight size={14} aria-hidden />
              </Link>
            )}

            {viewer ? (
              standing && (
                <div className="mt-6">
                  {earnedAt ? (
                    <p className="text-sm font-medium">You earned this medal on {questDay(earnedAt)}. It stays on your profile for good.</p>
                  ) : phase === "upcoming" ? (
                    <p className="text-sm text-muted-foreground">Starts {questDay(quest.startsAt)}. Books you finish from then on count.</p>
                  ) : (
                    <>
                      <div className="flex justify-between gap-3 text-sm tabular-nums">
                        <span className="font-medium">{phase === "ended" ? "Where you finished" : "Your progress"}</span>
                        <span className="text-muted-foreground">{standing.count} / {standing.target} books</span>
                      </div>
                      <div role="progressbar" aria-label="Your progress" aria-valuenow={standing.count} aria-valuemin={0} aria-valuemax={standing.target}
                        className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: design.colour }} />
                      </div>
                    </>
                  )}
                  {standing.books.length > 0 && (
                    <>
                      <h3 className="mt-6 text-sm font-semibold">Counted so far</h3>
                      <ul className="mt-3 flex flex-col gap-3">
                        {standing.books.map((b) => (
                          <li key={b.bookId} className="flex items-center gap-3">
                            <BookCover book={b} sizes="36px" variant="thumb" className="w-9 shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{b.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{b.author} · finished {questDay(b.finishedAt)}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                <Link href="/signin" className="font-medium text-foreground underline underline-offset-4">Sign in</Link> to see your progress. Every reader takes part automatically.
              </p>
            )}
          </div>

          <aside className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 text-sm h-fit">
            <h2 className="font-semibold">How it counts</h2>
            <ul className="mt-3 flex flex-col gap-2 text-muted-foreground list-disc pl-4">
              <li>Only books you finish between {questDay(quest.startsAt)} and {questDay(quest.endsAt)} (UTC) count. You&apos;re in automatically.</li>
              <li>Each book counts once, re-reads included.</li>
              {goal?.type === "startedInWindow" && <li>The book has to be started during the quest too, so books added straight to Finished don&apos;t count.</li>}
              {goal?.type === "pages" && <li>Page counts come from Open Library when the book is linked to it, and books over {PAGES_SANITY_MAX.toLocaleString("en-GB")} pages are left out.</li>}
              {goal?.type === "genre" && <li>Goes by the genre on your shelf copy of the book.</li>}
              <li>Imported books count only when their own read date falls inside the quest.</li>
              <li>Earn it and the medal stays on your profile after the quest ends.</li>
            </ul>
          </aside>
        </section>
      </Container>
    </div>
  )
}

export default Page
