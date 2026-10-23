import { cn } from '@/lib/utils'
import { FC } from 'react'

interface ContainerProps {
  children: React.ReactNode,
  className?: string
}

const Container: FC<ContainerProps> = ({children,className}) => {
  return (
    <div className={cn('container mx-auto px-4',className)}>
      {children}
    </div>
  )
}

export default Container