import { Metadata } from 'next'
import getCurrentUser from '@/app/actions/getCurrentUser'
import Container from '@/app/components/Container'
import PlusPricing from '@/app/components/plus/PlusPricing'
import { PLUS_PRICING, planStatusOf } from '@/lib/entitlements'

export const metadata: Metadata = {
  title: 'Bookmark Plus',
  description: `Every stat stays free. Plus adds recaps, hosting tools and personalisation, from $${PLUS_PRICING.monthly} a month or $${PLUS_PRICING.yearly} a year, with a ${PLUS_PRICING.trialDays}-day free trial and no card needed.`,
}

interface PageProps {
  searchParams: { checkout?: string }
}

// The pricing page. Public: signed-out visitors see the same table and a sign-up button.
export default async function Page({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  const status = user ? planStatusOf(user) : null
  const checkout = searchParams.checkout === 'success' || searchParams.checkout === 'cancelled' ? searchParams.checkout : null

  return (
    <div className="pt-10 sm:pt-16">
      <Container className="max-w-5xl">
        <PlusPricing
          signedIn={!!user}
          status={status && { ...status, until: status.until?.toISOString() ?? null }}
          checkout={checkout}
        />
      </Container>
    </div>
  )
}
