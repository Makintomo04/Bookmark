import Image from 'next/image'
import { FC } from 'react'

interface LogoProps {
  
}

const Logo: FC<LogoProps> = ({}) => {
  return (
    <div className="flex items-center gap-3 cursor-pointer">
      <Image src='/logo.svg' width={28} height={28} alt=''/>
      <span className="font-bold text-2xl">Bookmark</span>
      </div>
  )
}

export default Logo