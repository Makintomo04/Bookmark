"use client"
import { signIn } from 'next-auth/react'
import { FC } from 'react'
import { Button } from '../ui/button'
import { FaGithub, FaGoogle } from "react-icons/fa";
import { afterSignInPath } from '@/lib/callbackUrl'

interface SignInButtonProps {
  provider:String
  callbackPath?: string | null
}

const SignInWithOAuthButton: FC<SignInButtonProps> = ({provider, callbackPath = null}) => {
  const onSubmit = () => {
    // A first-time provider sign-in goes to /new-user instead, with this as its callbackUrl.
    signIn(provider.toLowerCase(),
      { callbackUrl: `${window.location.origin}${afterSignInPath(callbackPath)}` }
    )
  }
  const name = provider === "Github" ? "GitHub" : String(provider)
  return <div className='w-full'><Button type="button" variant="outline" size={'lg'} aria-label={`Continue with ${name}`} className='w-full flex gap-2 px-4 dark:border-slate-100/50' onClick={()=>onSubmit()} >
  {provider === "Google" ? <FaGoogle size={18} aria-hidden/> : <FaGithub size={20} aria-hidden/> }
  <span>{name}</span>
</Button></div>
}

export default SignInWithOAuthButton
