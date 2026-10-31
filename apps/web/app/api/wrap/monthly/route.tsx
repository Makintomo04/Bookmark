import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { getWrapped, parseWrappedMonth } from '@/lib/stats'
import { hidesRatings, wrappedStoryImage } from '@/app/components/wrapped/wrappedImage'

// Drawing a story image (reading data, fonts from Google, a cover fetch, then Satori) can run past
// Vercel's default 10 seconds: the current year's story was timing out with a 504.
export const maxDuration = 30

// A 1080×1920 share card for one month, from the Wrapped image generator. Free for everyone: it's the
// reader's own numbers, and every card carries Bookmark's name and link. Alternative designs are the
// Plus part (lib/entitlements.ts customWrapDesigns, planned).
//   GET /api/wrap/monthly?year=2026&month=10   (month 1–12; &ratings=hide leaves the stars off)
export async function GET(req: Request) {
  const { user, response } = await requireUser('Sign in to make a monthly Wrap card.')
  if (response) return response
  if (!user.username) return NextResponse.json({ error: 'Finish setting up your profile first.' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const period = parseWrappedMonth(searchParams.get('year') ?? '', searchParams.get('month') ?? '')
  if (!period) return NextResponse.json({ error: 'Pick a month that has already started.' }, { status: 400 })

  // A share card is made to be posted, so private books stay out of it.
  const wrapped = await getWrapped(user.id, period.year, period.month, { sharedOnly: true })
  const stamp = `${period.year}-${String(period.month + 1).padStart(2, '0')}`
  return wrappedStoryImage(
    { wrapped, username: user.username, displayName: user.displayName, favColour: user.favColour, hideRatings: hidesRatings(req.url) },
    {
      'Content-Disposition': `attachment; filename="bookmark-wrap-${stamp}.png"`,
      'Cache-Control': 'private, max-age=300',
    }
  )
}
