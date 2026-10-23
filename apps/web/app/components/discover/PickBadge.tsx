import { FC } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

const PickBadge: FC<{ className?: string }> = ({ className }) => (
  <span className={cn("inline-flex items-center gap-1 whitespace-nowrap font-medium text-foreground", className)}>
    <Image src="/logo.svg" alt="" width={12} height={12} />
    Bookmark Pick
  </span>
)

export default PickBadge
