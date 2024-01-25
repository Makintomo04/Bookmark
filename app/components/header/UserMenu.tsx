"use client"
import { FC, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from 'next/navigation'
import useUser from '@/app/hooks/useUser'
interface UserMenuProps {
  
}

const UserMenu: FC<UserMenuProps> = ({}) => {
  const router = useRouter()

  const { data: session } = useSession()
  const [showMenu, setShowMenu] = useState(false)
  const {user} = useUser()
  if (session) {
    return (
      <>
        {/* Signed in as {session?.user?.email} <br /> */}
        <div className="flex gap-2 relative">

        <Avatar className='cursor-pointer' onClick={()=>setShowMenu((state)=>!state)}>
      <AvatarImage src={user?.image} alt='avatar' />
      <AvatarFallback>SO</AvatarFallback>
    </Avatar>
        {showMenu && <div className="w-60 bg-white shadow-md absolute z-50 right-0 rounded-lg overflow-hidden top-10 mt-2 ">
          <p className='font-semibold text-md p-4'>Hello,<span> {user?.username}</span></p>
          <hr className=''/>
          <div className="flex flex-col gap-4 text-left">
            <button className='text-left text-sm cursor-pointer hover:bg-slate-100 transition font-semibold h-full p-4' onClick={() => signOut({
          callbackUrl: 'http://localhost:3000/signin'
        })}>Logout</button>
        </div>
        </div>}
        </div>
      </>
    )
    }
  return (
    <Avatar className='cursor-pointer' onClick={() => router.push("/signin")}>
      <AvatarImage src='/images/pfp.png' alt='avatar' />
      <AvatarFallback>SO</AvatarFallback>
    </Avatar>
  )
}

export default UserMenu