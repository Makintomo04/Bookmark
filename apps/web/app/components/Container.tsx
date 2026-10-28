import { cn } from '@/lib/utils'
import { FC } from 'react'

interface ContainerProps {
  children: React.ReactNode,
  className?: string
}

// The page's two lines. Everything you read or tap (the logo, headings, an avatar, a shelf) sits on the inner
// line: 16px from the screen on a phone, 32px inside the page's outer edge from sm up. Page-wide surfaces
// (a profile's banner) reach out to the outer edge with BLEED: the screen's edge on a phone.
const Container: FC<ContainerProps> = ({children,className}) => {
  return (
    <div className={cn('container mx-auto px-4 sm:px-12',className)}>
      {children}
    </div>
  )
}

// Pulls a surface from the inner line out to the outer edge (see Container).
export const BLEED = '-mx-4 sm:-mx-8'

export default Container
