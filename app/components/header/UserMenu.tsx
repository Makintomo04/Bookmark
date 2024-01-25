"use client"
import { FC } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { useSession, signIn, signOut } from "next-auth/react"
import { useRouter } from 'next/navigation'
interface UserMenuProps {
  
}

const UserMenu: FC<UserMenuProps> = ({}) => {
  const router = useRouter()

  const { data: session } = useSession()
  if (session) {
    return (
      <>
        {/* Signed in as {session?.user?.email} <br /> */}
        <div className="flex gap-2">

        <Avatar className='cursor-pointer'>
      <AvatarImage src={session?.user?.image!} alt='avatar' />
      <AvatarFallback>SO</AvatarFallback>
    </Avatar>
        <button onClick={() => signOut({
          callbackUrl: 'http://localhost:3000/signin'
        })}>Sign out</button>
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