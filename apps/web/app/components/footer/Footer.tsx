import { FC } from 'react'
import Link from 'next/link'
import Container from '../Container'
import Logo from '../Logo'
import FooterLinks from './FooterLinks'
import { supportEmail } from '@/lib/support'

const mutedLinkClassName = 'hover:text-foreground hover:underline hover:underline-offset-2 transition'

const Footer: FC = () => {
  return (
  <footer className="w-full pt-12 pb-10 dark:bg-background bg-neutral-100/40 mt-auto">
    <Container>
      <Logo/>

      <FooterLinks/>

      <div className="mt-12 pt-6 border-t flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Bookmark</p>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {supportEmail && <li><a href={`mailto:${supportEmail}`} className={mutedLinkClassName}>Contact</a></li>}
          {supportEmail && <li aria-hidden className="text-muted-foreground/50">·</li>}
          <li><Link href="/privacy" className={mutedLinkClassName}>Privacy</Link></li>
          <li aria-hidden className="text-muted-foreground/50">·</li>
          <li><Link href="/terms" className={mutedLinkClassName}>Terms</Link></li>
        </ul>
      </div>

      <div className="mt-6 pt-6 border-t text-xs text-muted-foreground">
        <p>Designed and built by <a href="https://www.michaelakintomo.com" target="_blank" rel="noreferrer" className={mutedLinkClassName}>Michael Akintomo</a></p>
      </div>
    </Container>
  </footer>
    )
}

export default Footer
