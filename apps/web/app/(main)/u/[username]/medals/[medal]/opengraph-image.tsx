import { findEarnedMedal } from '@bookmark/shared/medalShare'
import { handleOf } from '@/lib/handle'
import { getPublicProfile } from '@/lib/publicProfile'
import { MEDAL_OG_SIZE, medalOgImage } from '@/app/components/achievements/medalImage'

// What a shared medal link unfurls to. Node runtime, since Prisma doesn't run on the edge.
export const alt = 'A medal earned on Bookmark'
export const size = MEDAL_OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: { username: string; medal: string } }) {
  // Crawlers have no session: a followers-only or private profile gets no card, and nor does a medal they haven't earned.
  const data = await getPublicProfile(handleOf(params.username))
  if (!data || data.access !== 'full') return new Response('Not found', { status: 404 })
  const medal = findEarnedMedal(data.profile.achievements, params.medal)
  if (!medal) return new Response('Not found', { status: 404 })

  return medalOgImage({ username: data.profile.username, displayName: data.profile.displayName, achievement: medal.achievement, milestone: medal.milestone })
}
