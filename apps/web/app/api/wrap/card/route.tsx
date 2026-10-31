import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { guardEntitlement } from '@/lib/entitlementsServer'
import { getWrapCard, parseWrappedMonth, parseWrappedYear } from '@/lib/stats'
import { CARD_DESIGNS, cardFileName, parseCardDesign, parseCardKind, parseCardSize } from '@bookmark/shared/wrapCards'
import { hidesRatings } from '@/app/components/wrapped/wrappedImage'
import { wrapCardImage } from '@/app/components/wrapped/wrapCardImage'

// A grid of covers and dozens of cover fetches can run past Vercel's default 10 seconds.
export const maxDuration = 30

// A Wrap card (BOO-50): the cover grid or the stats card for a month or a year, as a PNG in 9:16,
// 4:5 or 1:1. The Midnight design is free for everyone; the other designs are Plus
// (entitlements.ts customWrapDesigns). Private books are always left out.
//   GET /api/wrap/card?kind=grid&size=story&design=midnight&year=2026&month=10
//   kind grid|stats, size story|portrait|square, month 1–12 or left off for the year, &ratings=hide
export async function GET(req: Request) {
  const { user, response } = await requireUser('Sign in to make a Wrap card.')
  if (response) return response
  if (!user.username) return NextResponse.json({ error: 'Finish setting up your profile first.' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const kind = parseCardKind(searchParams.get('kind'))
  const size = parseCardSize(searchParams.get('size'))
  const design = parseCardDesign(searchParams.get('design'))
  const rawYear = searchParams.get('year') ?? ''
  const rawMonth = searchParams.get('month')
  const period = rawMonth === null ? (parseWrappedYear(rawYear) ? { year: Number(rawYear), month: null } : null) : parseWrappedMonth(rawYear, rawMonth)
  if (!period) return NextResponse.json({ error: 'Pick a year or month that has already started.' }, { status: 400 })

  if (CARD_DESIGNS[design].plus) {
    const refused = await guardEntitlement(user.id, 'customWrapDesigns')
    if (refused) return refused
  }

  const card = await getWrapCard(user.id, period.year, period.month)
  if (card.books.length === 0) return NextResponse.json({ error: 'No finished books to put on this card yet.' }, { status: 404 })

  const file = cardFileName({ kind, size, year: period.year, month: period.month === null ? null : period.month + 1 })
  return wrapCardImage(
    { card, kind, size, design, username: user.username, favColour: user.favColour, hideRatings: hidesRatings(req.url) },
    {
      'Content-Disposition': `inline; filename="${file}.png"`,
      // It changes as the reader finishes books, so don't let a cache hold it for long.
      'Cache-Control': 'private, max-age=300',
    }
  )
}
