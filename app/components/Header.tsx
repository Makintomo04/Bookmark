"use client"
import { FC } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Container from './Container'
import UserMenu from './header/UserMenu'

const Header: FC = () => {
  return (
    <Container>
      <header className='h-20 flex items-center justify-between'>
        <Link href="/" className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400">
          <Image src='/logo.svg' width={28} height={28} alt='' />
          <span className="font-bold text-2xl">Bookmark</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/discover" className="hidden sm:inline-flex h-9 items-center px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400">
            Discover
          </Link>
          <UserMenu />
        </div>
      </header>
    </Container>
  )
}

export default Header
