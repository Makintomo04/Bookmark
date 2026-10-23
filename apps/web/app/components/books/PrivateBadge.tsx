import { FC } from 'react'
import { EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

// Marks a book the reader made private. Inverted (light on dark, dark on light) so it reads as a label
// over any cover or card, and never as a shelf icon like Will not read's plain EyeOff.
const PrivateBadge: FC<{ className?: string }> = ({ className }) => (
  <span
    title="Private: only you can see this book"
    className={cn(
      "inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background shadow-sm ring-1 ring-background/20",
      className
    )}
  >
    <EyeOff size={11} aria-hidden="true" />Only you
  </span>
)

export default PrivateBadge
