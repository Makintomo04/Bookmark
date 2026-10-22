import { Metadata } from 'next'
import { headers } from 'next/headers'
import getCurrentUser from '@/app/actions/getCurrentUser'
import Container from '@/app/components/Container'
import PlusPricing from '@/app/components/plus/PlusPricing'
import { PLUS_PRICING, planStatusOf } from '@/lib/entitlements'
import { currentFoundingStatus, currentLifetimeStatus } from '@/lib/entitlementsServer'
import { canRedeemGift } from '@/lib/plusRewards'
import { REGIONAL_PRICES, currencyForCountry, type PlusCurrency } from '@/lib/regionalPricing'

export const metadata: Metadata = {
  title: 'Bookmark Plus',
  description: `Every stat stays free. Plus adds recaps, hosting tools and extra goals, from $${PLUS_PRICING.monthly} a month or $${PLUS_PRICING.yearly} a year, with a ${PLUS_PRICING.trialDays}-day free trial and no card needed.`,
}

interface PageProps {
  searchParams: { checkout?: string; currency?: string }
}

const CURRENCIES: PlusCurrency[] = ['USD', 'GBP', 'EUR']

const serialiseWindow = (w: { open: boolean; remaining: number; closesAt: Date | null }) => ({ open: w.open, remaining: w.remaining, closesAt: w.closesAt?.toISOString() ?? null })

// The pricing page. Public: signed-out visitors see the same table and a sign-up button. Prices show in
// the visitor's currency from Vercel's country header; ?currency=GBP shows another (for checking).
export default async function Page({ searchParams }: PageProps) {
  const [user, founding, lifetime] = await Promise.all([getCurrentUser(), currentFoundingStatus(), currentLifetimeStatus()])
  const status = user ? planStatusOf(user) : null
  const checkout = searchParams.checkout === 'success' || searchParams.checkout === 'cancelled' ? searchParams.checkout : null
  const asked = searchParams.currency?.toUpperCase() as PlusCurrency | undefined
  const currency = asked && CURRENCIES.includes(asked) ? asked : currencyForCountry(headers().get('x-vercel-ip-country'))

  return (
    <div className="pt-10 sm:pt-16">
      <Container className="max-w-5xl">
        <PlusPricing
          signedIn={!!user}
          status={status && { ...status, until: status.until?.toISOString() ?? null, compUntil: status.compUntil?.toISOString() ?? null }}
          checkout={checkout}
          currency={currency}
          prices={REGIONAL_PRICES[currency]}
          founding={serialiseWindow(founding)}
          lifetime={serialiseWindow(lifetime)}
          canRedeemGift={!!user && canRedeemGift(user)}
        />
      </Container>
    </div>
  )
}
