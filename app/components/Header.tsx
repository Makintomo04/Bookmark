"use client"
import { FC } from 'react'
import Container from './Container'
import Image from 'next/image'
import { Avatar } from './ui/avatar'
import UserMenu from './header/UserMenu'
import { useRouter } from 'next/navigation'

interface HeaderProps {
  
}

const Header: FC<HeaderProps> = ({}) => {
  const router = useRouter();
  return (
      <Container>
    <header className='h-20 flex items-center justify-between '>
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push("/")}>
      <Image src='/logo.svg' width={28} height={28} alt='logo'/>
      <h1 className="font-bold text-2xl">Bookmark</h1>
      </div>
      <UserMenu/>
    </header>
      </Container>
  )
}

export default Header