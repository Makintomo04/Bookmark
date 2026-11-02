import Image from 'next/image'
import { FC } from 'react'

interface LogoProps {
  
}

const Logo: FC<LogoProps> = ({}) => {
  return (
    <div className="flex items-center gap-2.5 cursor-pointer">
      <Image src='/logo.svg' width={24} height={24} alt=''/>
      <span className="font-display font-semibold text-xl">Bookmark</span>
      </div>
  )
}

export default Logo