import { cn } from '@/lib/utils'
import { FC } from 'react'
import { Oval } from 'react-loader-spinner'

interface LoaderProps {
  notScreen?:boolean
}

const Loader: FC<LoaderProps> = ({notScreen}) => {
  return (
    <div className={cn("h-full relative flex justify-center items-center",notScreen?"w-full": "w-screen" )}>
      <Oval color='#F13C3C' secondaryColor="#F13C3C"strokeWidth={2.5} height={100} width={100} ariaLabel="oval-loading" />
    </div>
  )
}

export default Loader