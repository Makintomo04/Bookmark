import { redirect } from 'next/navigation'
import { defaultWrappedYear } from '@/lib/stats'

// /wrapped opens on this year's Wrapped in December, and on last year's the rest of the time.
export const dynamic = 'force-dynamic'

export default function Page() {
  redirect(`/wrapped/${defaultWrappedYear()}`)
}
