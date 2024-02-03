"use client"
import { FC, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from 'next/navigation'
import useUser from '@/app/hooks/useUser'
import { ThemeSwitcher } from '../ThemeSwitcher'
import Link from 'next/link'
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

        <Avatar className='cursor-pointer' onClick={()=>setShowMenu((state)=>!state)}>
      <AvatarImage src={user?.image || "/images/avatar.jpg"} alt='avatar' />
      <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
    </Avatar>
        {showMenu && <div className="w-60 bg-background shadow-md absolute z-50 right-0 rounded-lg overflow-hidden top-10 mt-2 ">
            <div onClick={(e)=>handleClick(e)} className="h-screen w-screen fixed inset-0 bg-red-700/0 -z-50"></div>
            <div className="z-10">
          <p className='font-semibold text-md p-4'>Hello,<span> {user?.username}</span></p>
          <hr className=''/>
          <div className="flex flex-col text-left">
            <Link className='text-left text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full p-4'href="/">Home</Link>
            <Link className='text-left text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full p-4'href="/favourites">Favourites</Link>
            <button className='text-left text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition font-semibold h-full p-4' onClick={() => signOut({
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