import { FC } from 'react'
import Link from 'next/link'
import Container from '../Container'
import Logo from '../Logo'

interface FooterProps {

}

const Footer: FC<FooterProps> = ({}) => {
  return (
  <div className="h-auto sm:h-28 sm:max-h-28 w-full p-8 dark:bg-background bg-slate-100/40 mt-auto">
    <Container>
      <div className="flex flex-col gap-3 items-center sm:items-stretch justify-center sm:justify-between h-full w-full">
      <Logo/>
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-center sm:self-end text-center sm:text-right">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <Link href="/terms" className="hover:underline hover:underline-offset-2 transition hover:text-[#F13C3C]">Terms</Link>
        <Link href="/privacy" className="hover:underline hover:underline-offset-2 transition hover:text-[#F13C3C]">Privacy</Link>
      </div>
    <p className='uppercase text-center pb-4 sm:pb-0 text-xs text-muted-foreground'>Designed and built by <a className='hover:underline hover:underline-offset-2 transition hover:text-[#F13C3C]' href="https://www.michaelakintomo.com" target="_blank" rel="noreferrer">Michael Akintomo</a></p>
      </div>
      </div>
    </Container>
  </div>
    )
}

export default Footer