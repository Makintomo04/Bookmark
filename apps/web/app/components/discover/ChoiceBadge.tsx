import { FC } from 'react'
import { Award } from 'lucide-react'
import { cn } from '@/lib/utils'

// A reader's list the Bookmark team chose to lead its genres on Discover (lib/genreListRules.ts).
const ChoiceBadge: FC<{ className?: string }> = ({ className }) => (
  <span className={cn("inline-flex items-center gap-1 whitespace-nowrap font-medium text-foreground", className)}>
    <Award size={12} className="text-brand" aria-hidden />
    Editors&apos; choice
  </span>
)

export default ChoiceBadge
