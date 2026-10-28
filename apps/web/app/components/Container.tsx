import { cn } from '@/lib/utils'
import { FC } from 'react'

// The three page widths. `wide` is the whole page (grids, dashboards, the header). `content` is for things you
// read down: feeds, reviews, a circle. `narrow` is for forms and legal text. Each narrows the content itself, so
// a width means the same on every page.
const WIDTHS = {
  wide: '',
  content: 'max-w-3xl',
  narrow: 'max-w-2xl',
} as const

export type ContainerWidth = keyof typeof WIDTHS

interface ContainerProps {
  children: React.ReactNode,
  className?: string,
  width?: ContainerWidth,
  // Narrow pages sit on the inner line with the logo, so content stays put as you move around. Centre only
  // standalone moments with nothing around them: sign-in, a circle invite, a medal, Wrapped.
  centred?: boolean
}

// The page's two lines. Everything you read or tap (the logo, headings, an avatar, a shelf) sits on the inner
// line: 16px from the screen on a phone, 32px inside the page's outer edge from sm up. Page-wide surfaces
// (a profile's banner) reach out to the outer edge with BLEED: the screen's edge on a phone.
// className goes on the box that holds the children, so `flex gap-6` works at any width.
const Container: FC<ContainerProps> = ({children,className,width='wide',centred=false}) => {
  if (width === 'wide') {
    return (
      <div className={cn('container mx-auto px-4 sm:px-12',className)}>
        {children}
      </div>
    )
  }
  return (
    <div className='container mx-auto px-4 sm:px-12'>
      <div className={cn(WIDTHS[width], centred && 'mx-auto', className)}>
        {children}
      </div>
    </div>
  )
}

// Pulls a surface from the inner line out to the outer edge (see Container).
export const BLEED = '-mx-4 sm:-mx-8'

// The gap between the header and a page's title. The layout already leaves room above the footer.
export const PAGE_TOP = 'mt-8 sm:mt-12'

export default Container
