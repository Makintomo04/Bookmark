import { FC } from 'react'
import Container from '../Container'
import Logo from '../Logo'

interface FooterProps {
  
}

const Footer: FC<FooterProps> = ({}) => {
  return (
  <div className="h-28 max-h-28 w-full p-8 dark:bg-background bg-slate-100/40 mt-auto">
    <Container>
      <div className="flex flex-col gap-3 items-center sm:items-stretch justify-center sm:justify-between h-full w-full">
      <Logo/>
    <p className='uppercase text-center pb-4 sm:pb-0 sm:text-left text-xs sm:self-end text-muted-foreground'>Designed and built by <a className='hover:underline hover:underline-offset-2 transition hover:text-[#F13C3C]' href="https://www.michaelakintomo.com" target="_blank" rel="noreferrer">Michael Akintomo</a></p>
      </div>
    </Container>
  </div>
    )
}

export default Footer