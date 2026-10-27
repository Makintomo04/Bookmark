import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Container from '@/app/components/Container'
import TierAvatar from '@/app/components/profile-head/TierAvatar'
import TierPreviewControls from '@/app/components/dev/TierPreviewControls'
import PlanPreviewControls from '@/app/components/dev/PlanPreviewControls'
import CelebrationPreviewControls from '@/app/components/dev/CelebrationPreviewControls'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { READER_TIERS, tierRingStyle } from '@/lib/readerTier'

export const metadata: Metadata = { title: "Dev tools" }

// Dev-only tools for your own account: a gallery of every reader tier, using your own avatar, so
// tiers can be QA'd without seeding hundreds of books, and a Plus switch. Not served in production.
const Page = async () => {
  if (process.env.NODE_ENV === 'production') notFound()
  const user = await getCurrentUser()
  const image = user?.image ?? null
  const colour = user?.favColour || "#F13C3C"
  const samples = [{ label: "No tier", minBooks: 0 }, ...READER_TIERS]

  return (
    <div className="mt-8 sm:mt-12">
      <Container>
        <h1 className="page-title">Dev tools</h1>
        <p className="mt-2 text-muted-foreground">Dev only. Each avatar is rendered at its tier&apos;s threshold.</p>
        <TierPreviewControls />
        <PlanPreviewControls />
        <CelebrationPreviewControls />

        <ul className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8">
          {samples.map((s) => (
            <li key={s.label} className="flex flex-col items-center gap-3 text-center">
              <TierAvatar image={image} username={user?.username} colour={colour} alt="" booksRead={s.minBooks} className="w-24 sm:w-28" />
              <div>
                <p className="font-medium">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.minBooks === 0 ? "Under 10 books" : `${s.minBooks}+ books`}</p>
              </div>
              <div className="flex items-center gap-3" aria-label="Small avatar rings">
                <div className="relative size-9 overflow-hidden rounded-full" style={{ background: colour, ...tierRingStyle(s.minBooks) }}>
                  {image && <Image src={image} alt="" fill sizes="36px" className="object-cover" />}
                </div>
                <div className="relative size-10 overflow-hidden rounded-[14px]" style={{ background: colour, ...tierRingStyle(s.minBooks) }}>
                  {image && <Image src={image} alt="" fill sizes="40px" className="object-cover" />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  )
}

export default Page
