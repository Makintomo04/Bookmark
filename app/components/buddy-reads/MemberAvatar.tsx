import { FC } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import InitialAvatar from '@/app/components/profile/InitialAvatar'

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
      {image
        ? <Image src={image} alt={username ? `${username}'s avatar` : ""} fill sizes={`${size}px`} className="object-cover" />
        : <InitialAvatar username={username} favColour={favColour} label={username ? `${username}'s avatar` : undefined} />}
    </span>
  )
}

export default MemberAvatar
