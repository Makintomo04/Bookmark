"use client"
import { FC, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from 'next/navigation'
import useUser from '@/app/hooks/useUser'
import { ThemeSwitcher } from '../ThemeSwitcher'
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

        <Avatar className='cursor-pointer ' onClick={()=>setShowMenu((state)=>!state)}>
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
            <button className='text-left p-12  text-2xl md:text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full md:p-4' onClick={() => signOut({
          callbackUrl: 'http://localhost:3000/signin'
        })}>Logout</button>
        </div>

            </div>
        </div>}
        </div>
      </>
    )
    }
  return (
    null
  )
}

export default UserMenu