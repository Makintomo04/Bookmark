import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { guardEntitlement } from '@/lib/entitlementsServer'
import { getWrapped, parseWrappedMonth } from '@/lib/stats'
import { wrappedStoryImage } from '@/app/components/wrapped/wrappedImage'

// A 1080×1920 share card for one month, from the Wrapped image generator. Plus only
// (lib/entitlements.ts monthlyWrapCards); the year-end Wrapped and its images stay free.
//   GET /api/wrap/monthly?year=2026&month=10   (month 1–12)
export async function GET(req: Request) {
  const { user, response } = await requireUser('Sign in to make a monthly Wrap card.')
  if (response) return response
  if (!user.username) return NextResponse.json({ error: 'Finish setting up your profile first.' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const period = parseWrappedMonth(searchParams.get('year') ?? '', searchParams.get('month') ?? '')
  if (!period) return NextResponse.json({ error: 'Pick a month that has already started.' }, { status: 400 })

  const refused = await guardEntitlement(user.id, 'monthlyWrapCards')
  if (refused) return refused

  const wrapped = await getWrapped(user.id, period.year, period.month)
  const stamp = `${period.year}-${String(period.month + 1).padStart(2, '0')}`
  return wrappedStoryImage(
    { wrapped, username: user.username, favColour: user.favColour },
    {
      'Content-Disposition': `attachment; filename="bookmark-wrap-${stamp}.png"`,
      'Cache-Control': 'private, max-age=300',
    }
  )
}
