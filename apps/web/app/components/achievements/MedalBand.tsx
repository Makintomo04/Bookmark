import { FC } from 'react'
import { cn } from '@/lib/utils'
import { READER_TIERS } from '@/lib/readerTier'
import { readableInk } from '@/lib/colour'
import Medal from './Medal'
import { MEDAL_INK, getMedalColour } from './achievementTheme'

interface MedalBandProps {
  achievementKey: string
  value: number
  // A tier-up swaps the medal's colour for the tier's metal.
  tierKey?: string | null
  eyebrow: string
  className?: string
}

// A band of the medal's colour (or the new tier's metal) with the medal sitting over its lower edge.
// The top of the celebration and of a shared medal's page.
const MedalBand: FC<MedalBandProps> = ({ achievementKey, value, tierKey, eyebrow, className }) => {
  const tier = tierKey ? READER_TIERS.find((t) => t.key === tierKey) : null
  const background = tier ? `linear-gradient(135deg, ${tier.light}, ${tier.colour} 45%, ${tier.shade})` : getMedalColour(achievementKey)
  const ink = tier ? readableInk(tier.colour) : MEDAL_INK

  return (
    <div className={cn("flex w-full flex-col items-center", className)}>
      <div className="relative flex h-32 w-full justify-center overflow-hidden pt-6" style={{ background }}>
        {/* Light from above, so a flat colour reads as lit rather than painted. */}
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(255,255,255,0.22),transparent_60%)]" />
        <p className="relative text-sm font-medium" style={{ color: ink }}>{eyebrow}</p>
      </div>
      <div className="-mt-14 rounded-full bg-background p-1.5">
        <Medal achievementKey={achievementKey} earned pill={String(value)} pillClassName="bg-neutral-900 text-white dark:bg-black" className="w-24" />
      </div>
    </div>
  )
}

export default MedalBand
