import { FC } from 'react'

interface MarqueeProps {
  children:React.ReactNode
}

const Marquee: FC<MarqueeProps> = ({children}) => {
  return (
    <div className="marquee leading-none font-bold text-[26px] max-w-[190px] text-white mb-2">
    {children}
  </div>
  )
}

export default Marquee