import { FC } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { getReaderTier } from '@/lib/readerTier'
import InitialAvatar from '@/app/components/profile/InitialAvatar'

interface TierAvatarProps {
  image?: string | null
  username?: string | null
  colour: string
  alt: string
  booksRead: number
  // Plus members get the rounded square; everyone else a circle.
  square?: boolean
  className?: string
}

// A profile picture, framed in the reader's tier metal once they have one.
// In the square, each layer's corner radius is the one outside it minus its padding, so the curves stay concentric.
const TierAvatar: FC<TierAvatarProps> = ({ image, username, colour, alt, booksRead, square, className }) => {
  const tier = getReaderTier(booksRead)

  return (
    // The outer background-coloured edge lifts the avatar off the banner.
    <div
      className={cn("relative aspect-square bg-background", square ? "rounded-[32px]" : "rounded-full", tier ? "p-[3px]" : "p-1", className)}
      title={tier ? `${tier.label} reader: ${tier.minBooks}+ books read` : undefined}
    >
      <div
        className={cn("relative h-full w-full", tier && "p-1.5", tier && (square ? "rounded-[29px]" : "rounded-full"))}
        style={tier ? { background: `linear-gradient(135deg, ${tier.light}, ${tier.colour} 45%, ${tier.shade})` } : undefined}
      >
        {tier?.shimmer && (
          <div aria-hidden className={cn("tier-shimmer absolute inset-0", square ? "rounded-[29px]" : "rounded-full", tier.key === "diamond" && "tier-shimmer-diamond")} />
        )}
        <div className={cn("relative h-full w-full overflow-hidden", !square ? "rounded-full" : tier ? "rounded-[23px]" : "rounded-[28px]")} style={{ background: colour }}>
          {image
            ? <Image src={image} alt={alt} fill sizes="112px" priority className="object-cover" />
            : <InitialAvatar username={username} favColour={colour} label={alt || undefined} />}
        </div>
      </div>
      {tier && <span className="sr-only">{tier.label} reader</span>}
    </div>
  )
}

export default TierAvatar
