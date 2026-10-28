import { FC, ReactNode } from 'react'
import { readerName } from '@/lib/profile'
import { cn } from '@/lib/utils'

interface ReaderNameProps {
  reader: { username: string | null; displayName?: string | null }
  // The name's own classes (weight, size). The handle is always small, regular and muted.
  className?: string
  // Straight after the name, before the handle: the staff seal (profile-head/StaffSeal.tsx).
  badge?: ReactNode
}

// A reader's name as cards, rows and headings print it: their display name with @username in muted
// text beside it, or just the username when they haven't set one (lib/profile.ts readerName). Inline,
// so it sits in a sentence ("Jane Reader @jane finished Dune") and truncates with its parent.
const ReaderName: FC<ReaderNameProps> = ({ reader, className, badge }) => (
  <>
    <span className={className}>{readerName(reader)}</span>
    {badge}
    {reader.displayName && reader.username && <span className={cn("ml-1.5 text-xs font-normal text-muted-foreground", className)}>@{reader.username}</span>}
  </>
)

export default ReaderName
