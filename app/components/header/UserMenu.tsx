"use client"
import { FC, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from 'next/navigation'
import useUser from '@/app/hooks/useUser'
import { ThemeSwitcher } from '../ThemeSwitcher'
import NotificationBell from './NotificationBell'
import Link from 'next/link'
import { IoClose } from 'react-icons/io5'
interface UserMenuProps {
  
}

const UserMenu: FC<UserMenuProps> = ({}) => {
  const router = useRouter()

  const { data: session } = useSession()
  const [showMenu, setShowMenu] = useState(false)
  function getInitials(fullName:string) {
    // Handle potential empty input
    if (!fullName) {
      return "";
    }
  
    // Split full name into words, handling hyphens and apostrophes
    const words = fullName.trim().split(/[\s-']+/);
  
    // Extract first letter of each word, ignoring non-alphabetical words
    const initials = words
      .map((word) => word.match(/^\b\w/))
      .filter((char) => char)
      .join("");
  
    return initials.toUpperCase(); // Uppercase for consistency
  }
  const handleClick = (e:React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setShowMenu(false)
  }

  const {user} = useUser()
  if (user) {
    return (
      <>
        {/* Signed in as {session?.user?.email} <br /> */}
        <div className="flex gap-2 relative items-center">
            <ThemeSwitcher/>
            <NotificationBell/>

        <Avatar className='cursor-pointer ' style={{background: user?.favColour || "#f44336"}} onClick={()=>setShowMenu((state)=>!state)}>
      <AvatarImage src={user?.image || "/images/avatar.jpg"} alt='avatar' />
      <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
    </Avatar>
        {showMenu && <div className="w-screen h-screen fixed top-0   md:h-auto md:p-0 md:w-60 bg-background shadow-md md:absolute z-50 right-0 rounded-lg overflow-hidden md:top-10 mt-2 ">
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
            {user?.username && <Link onClick={()=>setShowMenu(false)}  className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4'href={`/u/${user.username}`}>My Public Profile</Link>}
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
      <Link href="/register" className="text-sm font-semibold text-white bg-[#F13C3C] rounded-md px-4 py-2 hover:bg-[#d93333] transition">Sign up</Link>
    </div>
  )
}

export default UserMenu