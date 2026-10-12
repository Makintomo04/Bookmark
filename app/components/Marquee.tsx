"use client"
import { FC, useEffect, useRef } from 'react'

interface MarqueeProps {
  children:React.ReactNode
}

const Marquee: FC<MarqueeProps> = ({children}) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const overflow = el.scrollWidth - el.clientWidth
    el.style.setProperty('--translateX', overflow > 0 ? `-${overflow}px` : '0px')
  }, [children])

  return (
    <div ref={ref} className="marquee leading-none font-bold text-[26px] max-w-[190px] text-white mb-2">
    {children}
  </div>
  )
}

export default Marquee
