"use client"
import { FC } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search } from 'lucide-react'
import Container from './Container'
import UserMenu from './header/UserMenu'
import useUser from '@/app/hooks/useUser'

const Header: FC = () => {
  // Stats and Reading circles are a reader's own; signed out they only lead to sign-in (Stats) or an empty
  // page (circles are invite-only), so a visitor sees Discover alone. Shown once we know who's here, like UserMenu.
  const { user } = useUser()
  const member = !!user?.id
  return (
    <Container>
      {/* 56px, with the contents in its lower 40px: pages start 16px below the bar, so the space above the logo and
          avatar matches the space below them. The bar is a way around, so it gives the page its height back. */}
      <header className='h-14 pt-4 flex items-center justify-between'>
        <Link href="/" className="flex items-center gap-2 sm:gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Image src='/logo.svg' width={24} height={24} alt='' className="size-5 sm:size-6" />
          <span className="font-display font-semibold text-lg sm:text-xl">Bookmark</span>
        </Link>
        {/* Discover stays from sm: it is where to look a book up. Stats and Reading circles need a tablet-width screen (md):
            narrower than that the three slid under the wordmark, so the menu carries them. Tighter between tablet and
            laptop widths, so they stay on one line. */}
        <div className="flex items-center gap-2 md:gap-1 lg:gap-4">
          {/* The search icon says this is where to look a book up. */}
          <Link href="/discover" className="hidden sm:inline-flex h-9 items-center gap-1.5 px-2.5 lg:px-3 whitespace-nowrap rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Search size={16} aria-hidden />
            Discover
          </Link>
          {member && <>
            <Link href="/stats" className="hidden md:inline-flex h-9 items-center px-2.5 lg:px-3 whitespace-nowrap rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Stats
            </Link>
            <Link href="/circles" className="hidden md:inline-flex h-9 items-center px-2.5 lg:px-3 whitespace-nowrap rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Reading circles
            </Link>
          </>}
          <UserMenu />
        </div>
      </header>
    </Container>
  )
}

export default Header
