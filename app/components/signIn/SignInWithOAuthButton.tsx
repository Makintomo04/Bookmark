"use client"
import { signIn, useSession } from 'next-auth/react'
import { FC, useEffect } from 'react'
import { Button } from '../ui/button'
import { FaGithub, FaGoogle, FaTwitter } from "react-icons/fa";
import { useRouter } from 'next/navigation';

interface SignInButtonProps {
  provider:String
}

const SignInWithOAuthButton: FC<SignInButtonProps> = ({provider}) => {
  const router = useRouter()
  const { data: session, status } = useSession();

  useEffect(() => {
      if (session) window.close();
  }, [session, status]);

  const onSubmit = () => {
    signIn(provider.toLowerCase(),
      { callbackUrl: `${window.location.origin}/` }
    )
  }
  return <div className='w-full'><Button variant="outline" size={'lg'} className='w-full flex gap-3 dark:border-slate-100/50' onClick={()=>onSubmit()} >
  <span></span> {provider === "Google" ? <FaGoogle size={18}/> : <FaGithub size={20}/> }
</Button></div>
}

export default SignInWithOAuthButton