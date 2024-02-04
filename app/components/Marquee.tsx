"use client"
import { FC, useEffect, useRef, useState } from 'react'
import { easeCircleOut } from 'd3-ease'; 
interface MarqueeProps {
  children:React.ReactNode
}

const Marquee: FC<MarqueeProps> = ({children}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0);

useEffect(() => {
  if (ref.current) {
    const marquee = ref.current;
    const textLength = marquee.innerText.length;
    const scrollDuration = 5; // Adjust duration
    const fontWidth = 10; // Adjust for font and spacing

    const maxTranslateX = textLength * fontWidth * scrollDuration;

    const animate = () => {
      if (!marquee) return; // Handle potential early exits

      const elapsedTime = performance.now() - startTime;
      const newProgress = Math.min(elapsedTime / scrollDuration, 1);

      if (newProgress === 1) {
        startTime = performance.now();
        setProgress(0);
      } else {
        setProgress(newProgress);
        const translatedX = progress * maxTranslateX * easeCircleOut(progress);
        marquee.style.setProperty('--translateX', `calc(-100% - ${translatedX}px)`);
        requestAnimationFrame(animate);
      }
    };

    let startTime = performance.now();
    animate();
  }
}, [ref]);
  return (
    <div ref={ref} className="marquee leading-none font-bold text-[26px] max-w-[190px] text-white mb-2">
    {children}
  </div>
  )
}

export default Marquee