import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { guardEntitlement } from '@/lib/entitlementsServer'
import { getRangeWrapCard, getWrapCard, parseWrappedMonth, parseWrappedYear } from '@/lib/stats'
import { CARD_DESIGNS, cardFileName, parseCardDesign, parseCardKind, parseCardSize, type CardPeriod } from '@bookmark/shared/wrapCards'
import { parseExplorerQuery } from '@bookmark/shared/statsExplorer'
import { DEFAULT_TIME_ZONE, isValidTimeZone, localDay } from '@bookmark/shared/timeZone'
import { hidesRatings } from '@/app/components/wrapped/wrappedImage'
import { wrapCardImage } from '@/app/components/wrapped/wrapCardImage'

// A grid of covers and dozens of cover fetches can run past Vercel's default 10 seconds.
export const maxDuration = 30

// A Wrap card (BOO-50): the cover grid or the stats card for a month or a year, as a PNG in 9:16,
// 4:5 or 1:1. The Midnight design is free for everyone; the other designs are Plus
// (entitlements.ts customWrapDesigns). Private books are always left out. A card for any range of days
// is the stats explorer's (BOO-82) and Plus (statsExplorer); every year and month card stays free.
//   GET /api/wrap/card?kind=grid&size=story&design=midnight&year=2026&month=10
//   GET /api/wrap/card?kind=grid&size=story&design=midnight&from=2026-06-01&to=2026-08-31
//   kind grid|stats, size story|portrait|square, month 1–12 or left off for the year, &ratings=hide
export async function GET(req: Request) {
  const { user, response } = await requireUser('Sign in to make a Wrap card.')
  if (response) return response
  if (!user.username) return NextResponse.json({ error: 'Finish setting up your profile first.' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const kind = parseCardKind(searchParams.get('kind'))
  const size = parseCardSize(searchParams.get('size'))
  const design = parseCardDesign(searchParams.get('design'))

  let period: CardPeriod
  if (searchParams.has('from') || searchParams.has('to')) {
    const refused = await guardEntitlement(user.id, 'statsExplorer')
    if (refused) return refused
    // Only the dates count here: the explorer's filters don't reach a card.
    const parsed = parseExplorerQuery(new URLSearchParams({ from: searchParams.get('from') ?? '', to: searchParams.get('to') ?? '' }), localDay(new Date(), isValidTimeZone(user.timeZone) ? user.timeZone : DEFAULT_TIME_ZONE))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    period = { range: parsed.query.range }
  } else {
    const rawYear = searchParams.get('year') ?? ''
    const rawMonth = searchParams.get('month')
    const picked = rawMonth === null ? (parseWrappedYear(rawYear) ? { year: Number(rawYear), month: null } : null) : parseWrappedMonth(rawYear, rawMonth)
    if (!picked) return NextResponse.json({ error: 'Pick a year or month that has already started.' }, { status: 400 })
    period = picked
  }

  if (CARD_DESIGNS[design].plus) {
    const refused = await guardEntitlement(user.id, 'customWrapDesigns')
    if (refused) return refused
  }

  const card = 'range' in period ? await getRangeWrapCard(user.id, period.range) : await getWrapCard(user.id, period.year, period.month)
  if (card.books.length === 0) return NextResponse.json({ error: 'No finished books to put on this card yet.' }, { status: 404 })

  const file = cardFileName('range' in period ? { kind, size, range: period.range } : { kind, size, year: period.year, month: period.month === null ? null : period.month + 1 })
  return wrapCardImage(
    { card, kind, size, design, username: user.username, favColour: user.favColour, hideRatings: hidesRatings(req.url) },
    {
      'Content-Disposition': `inline; filename="${file}.png"`,
      // It changes as the reader finishes books, so don't let a cache hold it for long.
      'Cache-Control': 'private, max-age=300',
      // The signed-in reader's own card, so never one cached for someone else (wrap/monthly says why).
      Vary: 'Authorization, Cookie',
    }
  )
}
