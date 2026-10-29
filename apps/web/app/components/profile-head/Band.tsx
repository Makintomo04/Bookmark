import { FC, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The profile's two layouts. "bands" is the profile: your header beside what you're reading, then rows that
// pair a wide section with a narrow one (docs/profile-layout-spike.html has how it was settled). "classic" is
// the page as it was before, one column, kept behind ?layout=classic as a way back while bands beds in.
export type ProfileLayout = 'bands' | 'classic'

export const profileLayoutOf = (value: unknown): ProfileLayout => (value === 'classic' ? 'classic' : 'bands')

// The shelf writes its search and filters into the URL; this keeps the layout through those writes.
export const LAYOUT_PARAM = 'layout'

interface BandProps {
  // Two thirds from lg up. Stacks above the narrow side below lg.
  wide: ReactNode
  // One third from lg up.
  narrow?: ReactNode
  className?: string
}

// One row of the profile in bands: a wide section beside a narrow one from lg up, stacked below. Either side
// can come back empty (a section with nothing to show renders nothing), and then the other has the row, so
// there's never an empty box; with both empty the band takes no space at all.
const Band: FC<BandProps> = ({ wide, narrow, className }) => (
  <div className={cn(
    "flex flex-col gap-12 lg:flex-row lg:gap-10 [&:not(:has(>div:not(:empty)))]:hidden",
    className,
  )}>
    <div className="min-w-0 lg:flex-[2] empty:hidden">{wide}</div>
    <div className="min-w-0 lg:flex-1 empty:hidden">{narrow}</div>
  </div>
)

export default Band
