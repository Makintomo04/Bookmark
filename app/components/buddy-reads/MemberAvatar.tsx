import { FC } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

export const memberColour = (favColour: string | null | undefined) => favColour || '#D92D2D'

interface MemberAvatarProps {
  username: string | null
  image: string | null
  favColour: string | null
  size?: number
  className?: string
  // A ring in the member's colour, for avatars sitting on a coloured track.
  ringed?: boolean
}

const MemberAvatar: FC<MemberAvatarProps> = ({ username, image, favColour, size = 32, className, ringed }) => {
  const colour = memberColour(favColour)
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-[30%]", className)}
      style={{ width: size, height: size, background: colour, boxShadow: ringed ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${colour}` : undefined }}
      title={username ?? undefined}
    >
      <Image src={image || "/images/avatar.jpg"} alt={username ? `${username}'s avatar` : ""} fill sizes={`${size}px`} className="object-cover" />
    </span>
  )
}

export default MemberAvatar
