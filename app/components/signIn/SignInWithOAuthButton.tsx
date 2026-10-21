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
  return <div className='w-full'><Button type="button" variant="outline" size={'lg'} aria-label={`Continue with ${provider === "Github" ? "GitHub" : provider}`} className='w-full flex gap-3 dark:border-slate-100/50' onClick={()=>onSubmit()} >
  <span></span> {provider === "Google" ? <FaGoogle size={18} aria-hidden/> : <FaGithub size={20} aria-hidden/> }
</Button></div>
}

export default SignInWithOAuthButton
