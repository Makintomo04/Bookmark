import { FC } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { getReaderTier } from '@/lib/readerTier'

interface TierAvatarProps {
  image?: string | null
  colour: string
  alt: string
  booksRead: number
  className?: string
}

// A rounded-square profile picture, framed in the reader's tier metal once they have one.
// Each layer's corner radius is the one outside it minus its padding, so the curves stay concentric.
const TierAvatar: FC<TierAvatarProps> = ({ image, colour, alt, booksRead, className }) => {
  const tier = getReaderTier(booksRead)

  return (
    // The outer background-coloured edge lifts the avatar off the banner.
    <div
      className={cn("relative aspect-square rounded-[32px] bg-background", tier ? "p-[3px]" : "p-1", className)}
      title={tier ? `${tier.label} reader: ${tier.minBooks}+ books read` : undefined}
    >
      <div
        className={cn("relative h-full w-full", tier && "rounded-[29px] p-1")}
        style={tier ? { background: `linear-gradient(135deg, ${tier.light}, ${tier.colour} 45%, ${tier.shade})` } : undefined}
      >
        {tier?.shimmer && (
          <div aria-hidden className={cn("tier-shimmer absolute inset-0 rounded-[29px]", tier.key === "diamond" && "tier-shimmer-diamond")} />
        )}
        <div className={cn("relative h-full w-full overflow-hidden", tier ? "rounded-[25px]" : "rounded-[28px]")} style={{ background: colour }}>
          <Image src={image || "/images/avatar.jpg"} alt={alt} fill sizes="112px" priority className="object-cover" />
        </div>
      </div>
      {tier && <span className="sr-only">{tier.label} reader</span>}
    </div>
  )
}

export default TierAvatar
