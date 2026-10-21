"use client"
import { signIn } from 'next-auth/react'
import { FC } from 'react'
import { Button } from '../ui/button'
import { FaGithub, FaGoogle } from "react-icons/fa";

interface SignInButtonProps {
  provider:String
}

const SignInWithOAuthButton: FC<SignInButtonProps> = ({provider}) => {
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