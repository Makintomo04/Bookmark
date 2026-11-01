import { activeSponsorship, seesSponsored, type AdPlacement } from '@bookmark/shared/sponsorships'

type Viewer = Parameters<typeof seesSponsored>[0]

// A sponsored slot (packages/shared/src/sponsorships.ts). Renders nothing for Plus readers, and nothing
// when no campaign is booked for the placement, so an empty slot never leaves a gap on the page.
const AdSlot = ({ placement, viewer, className = '' }: { placement: AdPlacement; viewer: Viewer; className?: string }) => {
  if (!seesSponsored(viewer)) return null
  const ad = activeSponsorship(placement, new Date().toISOString().slice(0, 10))
  if (!ad) return null

  return (
    <aside aria-label="Sponsored" className={`flex flex-col gap-2 ${className}`}>
      <p className="text-xs text-muted-foreground">Sponsored by {ad.sponsor}</p>
      <a href={ad.href} target="_blank" rel="sponsored noopener noreferrer" className="group flex flex-col gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="font-display text-lg font-semibold group-hover:underline underline-offset-2">{ad.title}</span>
        <span className="text-sm text-muted-foreground">{ad.body}</span>
      </a>
    </aside>
  )
}

export default AdSlot
