import { FC } from 'react'
import { readableInk, toHex } from '@/lib/colour'
import { cn } from '@/lib/utils'

export const DEFAULT_AVATAR_COLOUR = '#D92D2D'

// A reader's colour as #rrggbb: older profiles stored rgba strings, and some never picked one.
export const avatarColour = (favColour: string | null | undefined) => toHex(favColour ?? '') ?? DEFAULT_AVATAR_COLOUR

interface InitialAvatarProps {
  username: string | null | undefined
  favColour: string | null | undefined
  // Read out in place of the photo's alt text; leave empty when the name is already next to it.
  label?: string
  className?: string
}

// Stands in for a profile photo: the reader's first initial on their colour.
// Fills its (positioned) parent, so each avatar keeps its own shape and size; the SVG scales the letter with it.
const InitialAvatar: FC<InitialAvatarProps> = ({ username, favColour, label, className }) => {
  const colour = avatarColour(favColour)
  const initial = username?.trim().charAt(0).toUpperCase() ?? ''
  return (
    <span
      className={cn('absolute inset-0 select-none', className)}
      style={{ background: colour }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {initial && (
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
          <text x="50" y="50" dy="0.35em" textAnchor="middle" fontSize="48" fontWeight="600" fill={readableInk(colour)} fontFamily="inherit">
            {initial}
          </text>
        </svg>
      )}
    </span>
  )
}

export default InitialAvatar
