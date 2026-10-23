import { FC } from 'react'
import Link from 'next/link'
import Container from '../Container'
import Logo from '../Logo'
import { supportEmail } from '@/lib/support'

const linkClassName = 'hover:underline hover:underline-offset-2 transition hover:text-brand-text'

const Footer: FC = () => {
  return (
  <footer className="h-auto sm:h-28 sm:max-h-28 w-full p-8 dark:bg-background bg-neutral-100/40 mt-auto">
    <Container>
      <div className="flex flex-col gap-3 items-center sm:items-stretch justify-center sm:justify-between h-full w-full">
      <Logo/>
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-center sm:self-end text-center sm:text-right">
      <nav aria-label="Footer" className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        <Link href="/about" className={linkClassName}>About</Link>
        {supportEmail && <a href={`mailto:${supportEmail}`} className={linkClassName}>Contact</a>}
        <Link href="/terms" className={linkClassName}>Terms</Link>
        <Link href="/privacy" className={linkClassName}>Privacy</Link>
      </nav>
    <p className='uppercase text-center pb-4 sm:pb-0 text-xs text-muted-foreground'>Designed and built by <a className={linkClassName} href="https://www.michaelakintomo.com" target="_blank" rel="noreferrer">Michael Akintomo</a></p>
      </div>
      </div>
    </Container>
  </footer>
    )
}

export default Footer
