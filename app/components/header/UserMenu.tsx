"use client"
import { FC, useEffect, useState } from 'react'
import { booksReadOf, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import InitialAvatar, { avatarColour } from '../profile/InitialAvatar'
import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from 'next/navigation'
import useUser from '@/app/hooks/useUser'
import { ThemeSwitcher } from '../ThemeSwitcher'
import NotificationBell from './NotificationBell'
import Link from 'next/link'
import { IoClose } from 'react-icons/io5'
import { isWrappedSeason } from '@/lib/wrappedSeason'
interface UserMenuProps {
  
}

const UserMenu: FC<UserMenuProps> = ({}) => {
  const router = useRouter()

  const { data: session } = useSession()
  const [showMenu, setShowMenu] = useState(false)
  const handleClick = (e:React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setShowMenu(false)
  }

  const {user} = useUser()
  const booksReadFor = useBooksReadFor()
  // From 1 December, in the reader's own calendar. Set after mount, so the server's clock (UTC) never disagrees with the browser's at hydration.
  const [wrappedYear, setWrappedYear] = useState<number | null>(null)
  useEffect(() => {
    if (isWrappedSeason()) setWrappedYear(new Date().getFullYear())
  }, [])
  // Below md the menu covers the screen, so freeze the page behind it; otherwise a swipe scrolls the page instead of the menu.
  useEffect(() => {
    if (!showMenu || !window.matchMedia('(max-width: 767px)').matches) return
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [showMenu])
  if (user) {
    return (
      <>
        {/* Signed in as {session?.user?.email} <br /> */}
        <div className="flex gap-2 relative items-center">
            {wrappedYear && (
              <Link href={`/wrapped/${wrappedYear}`} className="hidden sm:inline-flex h-9 items-center px-3 rounded-full text-sm font-semibold text-white bg-brand-fill hover:bg-brand-fill-hover transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400">
                Your {wrappedYear} Wrapped
              </Link>
            )}
            <ThemeSwitcher/>
            <NotificationBell/>

        <Avatar className='cursor-pointer ' style={{background: avatarColour(user?.favColour), ...tierRingStyle(booksReadFor(user?.username, booksReadOf(user)))}} onClick={()=>setShowMenu((state)=>!state)}>
      {user?.image && <AvatarImage src={user.image} alt='avatar' />}
      {/* Also covers a photo that fails to load. */}
      <AvatarFallback className='bg-transparent'><InitialAvatar username={user?.username} favColour={user?.favColour} label='avatar' /></AvatarFallback>
    </Avatar>
        {showMenu && <div className="w-screen h-[100dvh] fixed top-0   md:h-auto md:p-0 md:w-60 bg-background shadow-md md:absolute z-50 right-0 rounded-lg overflow-y-auto overscroll-contain md:overflow-hidden md:top-10 md:mt-2 ">
            <div onClick={(e)=>handleClick(e)} className="h-screen w-screen fixed inset-0 bg-red-700/0 -z-50"></div>
            <div className="z-10">
           <div className="flex items-center justify-between p-12 md:p-4">
          <p className='font-semibold text-3xl md:text-lg '>Hello,<span> {user?.username}</span></p>
          <div className="p-2 bg-slate-200 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 cursor-pointer transition rounded-full md:hidden" onClick={()=>setShowMenu(false)} >
          <IoClose size={24} />
          </div>
            </div> 
          <hr className=''/>
          <div className="flex flex-col text-left w-full">
            <Link onClick={()=>setShowMenu(false)} className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4'href="/">Home</Link>
            <Link onClick={()=>setShowMenu(false)}  className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4'href="/favourites">Favourites</Link>
            <Link onClick={()=>setShowMenu(false)}  className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4'href="/feed">Feed</Link>
            <Link onClick={()=>setShowMenu(false)}  className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4'href="/discover">Discover</Link>
            <Link onClick={()=>setShowMenu(false)}  className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4'href="/stats">Stats</Link>
            <Link onClick={()=>setShowMenu(false)}  className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4'href="/circles">Reading circles</Link>
            <Link onClick={()=>setShowMenu(false)}  className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4'href="/quests">Quests</Link>
            {wrappedYear && <Link onClick={()=>setShowMenu(false)}  className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4'href={`/wrapped/${wrappedYear}`}>Your {wrappedYear} Wrapped</Link>}
            <button className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4' onClick={() => signOut({
          callbackUrl: `${window.location.origin}/signin`
        })}>Logout</button>
        </div>

            </div>
        </div>}
        </div>
      </>
    )
    }
  return (
    <div className="flex gap-2 items-center">
      <ThemeSwitcher/>
      <Link href="/signin" className="text-sm font-semibold hover:underline">Sign in</Link>
      <Link href="/register" className="text-sm font-semibold text-white bg-brand-fill rounded-md px-4 py-2 hover:bg-brand-fill-hover transition">Sign up</Link>
    </div>
  )
}

export default UserMenu