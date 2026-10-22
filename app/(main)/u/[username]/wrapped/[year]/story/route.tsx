import getCurrentUser from '@/app/actions/getCurrentUser'
import { getWrapped, getWrappedOwner, isWrappedPublic, parseWrappedYear } from '@/lib/stats'
import { wrappedStoryImage } from '@/app/components/wrapped/wrappedImage'

// Drawing a story image (reading data, fonts from Google, a cover fetch, then Satori) can run past
// Vercel's default 10 seconds: the current year's story was timing out with a 504.
export const maxDuration = 30

// The 1080×1920 story image, as a download. The owner can always get theirs; anyone else only
// while the Wrapped is public.
export async function GET(_req: Request, { params }: { params: { username: string; year: string } }) {
  const year = parseWrappedYear(params.year)
  const owner = year ? await getWrappedOwner(params.username) : null
  if (!year || !owner) return new Response('Not found', { status: 404 })
  if (!(await isWrappedPublic(owner))) {
    const viewer = await getCurrentUser()
    if (viewer?.id !== owner.id) return new Response('Not found', { status: 404 })
  }

  const wrapped = await getWrapped(owner.id, year)
  return wrappedStoryImage(
    { wrapped, username: owner.username, favColour: owner.favColour },
    {
      'Content-Disposition': `attachment; filename="bookmark-wrapped-${year}.png"`,
      // It changes as the reader finishes books, so don't let a cache hold it for long.
      'Cache-Control': 'private, max-age=300',
    }
  )
}
