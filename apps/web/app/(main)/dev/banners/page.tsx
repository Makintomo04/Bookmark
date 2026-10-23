import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Container from '@/app/components/Container'
import BannerPattern from '@/app/components/profile/BannerPattern'
import { BANNER_PRESETS } from '@/lib/banners'
import { SWATCHES } from '@/lib/profile'

export const metadata: Metadata = { title: "Banners" }

// Dev-only gallery of every preset banner at the sizes it's really drawn: the full-width profile
// header, a phone-width header and the picker thumbnail, in every swatch colour. Not served in production.
const Page = () => {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <div className="mt-8 sm:mt-12">
      <Container>
        <h1 className="page-title">Banners</h1>
        <p className="mt-2 text-muted-foreground">Dev only. Each preset as the profile header, at phone width, and as picker thumbnails in every swatch.</p>
        <ul className="mt-8 flex flex-col gap-12">
          {BANNER_PRESETS.map((p) => (
            <li key={p.id}>
              <p className="font-medium">{p.name}</p>
              <div className="relative mt-2 h-44 overflow-hidden rounded-2xl">
                <BannerPattern preset={p.id} colour={SWATCHES[0]} />
              </div>
              <div className="mt-3 flex flex-wrap items-start gap-3">
                <div className="relative h-32 w-[343px] overflow-hidden rounded-2xl">
                  <BannerPattern preset={p.id} colour={SWATCHES[5]} />
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {SWATCHES.map((c) => (
                    <div key={c} className="relative h-11 w-20 overflow-hidden rounded-lg">
                      <BannerPattern preset={p.id} colour={c} />
                    </div>
                  ))}
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
