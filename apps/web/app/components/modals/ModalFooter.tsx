import { FC } from 'react'
import { cn } from '@/lib/utils'

interface ModalFooterProps {
  // The secondary action first, then the one brand-fill action: it always ends up on the right.
  children: React.ReactNode
  // An action set apart on the left from sm up (Delete, Move to Want to read); on a phone it takes a row above.
  start?: React.ReactNode
  className?: string
}

// Every modal's buttons, laid out one way (BOO-98). On a phone they share the row equally; from sm up they sit
// at the right at their own width. Use a ghost Button for the secondary and the default Button for the primary.
const ModalFooter: FC<ModalFooterProps> = ({ children, start, className }) => (
  <div className={cn("flex w-full flex-wrap items-center gap-2 px-6 pb-6 pt-4 sm:justify-end", className)}>
    {start && <div className="flex basis-full flex-wrap gap-2 *:flex-1 sm:mr-auto sm:basis-auto sm:*:flex-none">{start}</div>}
    <div className="flex flex-1 gap-2 *:flex-1 sm:flex-none sm:*:flex-none">{children}</div>
  </div>
)

export default ModalFooter
