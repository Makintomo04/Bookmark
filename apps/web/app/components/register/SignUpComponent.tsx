"use client"
import { useEffect, useState } from 'react'
import { Input } from '../ui/input'
import { PasswordInput } from '../ui/password-input'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '../ui/button'
import SignInWithOAuthButton, { appleSignInShown } from '../signIn/SignInWithOAuthButton'
import { motion,AnimatePresence  } from 'framer-motion'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import axios from 'axios'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/authSchemas'
import CheckInboxNotice from '../signIn/CheckInboxNotice'
import { safeCallbackPath, withCallback } from '@/lib/callbackUrl'

const linkClass = 'text-brand-text font-semibold cursor-pointer hover:underline hover:underline-offset-2 transition'

const SignUpComponent =  () => {
const [isLoading, setIsLoading] = useState(false);
// Set once the account exists; it can't sign in until the emailed link is opened.
const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
// The email already had an unconfirmed sign-up, so a fresh link went out instead of a new account.
const [resent, setResent] = useState(false);
const [serverError, setServerError] = useState<string | null>(null);
// Where they were headed (e.g. an invite); kept through the verification email and sign-in.
const [callbackPath, setCallbackPath] = useState<string | null>(null);
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  setCallbackPath(safeCallbackPath(params.get("callbackUrl"), window.location.origin))
}, [])
const {
  register,
  handleSubmit,
  formState:{errors},
} = useForm<FieldValues>({
  defaultValues: {
    email: "",
    password:"",
  },
})

// One password field with a show toggle rather than a repeat field: a typo is visible, and the
// verification email plus password reset cover the rest.
const onSubmit:SubmitHandler<FieldValues> = async (data) => {
  setServerError(null)
  try {
    setIsLoading(true)
    const res = await axios.post("/api/register", { email: data.email, password: data.password, callbackUrl: callbackPath })
    setResent(Boolean(res.data?.resent))
    setRegisteredEmail(String(data.email).trim())
  } catch (error) {
    setServerError(axios.isAxiosError(error) && error.response?.data?.error || "Something went wrong. Please try again.")
  }
  finally{
    setIsLoading(false)
  }
}
let initial = {};
let animate = {};
let transition = {};
let exit = {};

if (typeof window !== "undefined") {
const isMobile = window.innerWidth < 640;
if (!isMobile) {

    initial={ opacity: 1,y:50 },
    animate={ opacity: 1,y:0 },
    transition={ ease: "circIn" },
    exit={ opacity: 1,y:50 }

}
}

  return (
    <AnimatePresence>
    <motion.div
    {...{initial,animate,transition,exit}}
    className='w-full min-h-dvh sm:w-[500px] sm:min-h-0 rounded-none py-10 sm:p-6 bg-background sm:bg-popover sm:border sm:rounded-xl'>
      <div className="flex justify-center items-center gap-3 mb-6">
      <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Image src='/logo.svg' width={40} height={40} alt='Bookmark home'/></Link>
      </div>
  {registeredEmail ? (
  <div className="">
    <h1 className="page-title mb-10 text-center">Check your inbox</h1>
    <CheckInboxNotice
      email={registeredEmail}
      title={resent ? "You'd already started signing up" : "Account created"}
    />
    {resent && <p className='text-sm mt-4 text-muted-foreground'>We sent a fresh link. Sign in with the password you chose the first time, or <Link href="/forgot-password" className='font-semibold underline'>reset it</Link>.</p>}
    <p className='text-sm mt-4'>Confirmed your email? <Link href={withCallback(`/signin?email=${encodeURIComponent(registeredEmail)}`, callbackPath)} className={linkClass}>Sign in</Link></p>
  </div>
  ) : (
  <div className="">
    <h1 className="page-title mb-10 text-center">Create your account</h1>
    {serverError && (
      <p role="alert" className="mb-4 rounded-md bg-danger/10 text-danger text-sm px-3 py-2">
        {serverError} {serverError.includes("already exists") && <Link href={withCallback("/signin", callbackPath)} className="font-semibold underline">Sign in</Link>}
      </p>
    )}
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email">Email</label>
        <Input
          register={register}
          inputValidation={{
            required:true,
            message:"Enter your email.",
            pattern:{ value:/^[^\s@]+@[^\s@]+\.[^\s@]+$/, message:"Enter a valid email address." },
          }}
          errors={errors} type="email" name="email" id="email" autoComplete="email" inputMode="email" className=""/>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password">Password</label>
        <PasswordInput
          register={register}
          inputValidation={{
            required:true,
            message:"Choose a password.",
            minLength:{ value:PASSWORD_MIN, message:`Use at least ${PASSWORD_MIN} characters.` },
            maxLength:{ value:PASSWORD_MAX, message:`Use ${PASSWORD_MAX} characters or fewer.` },
          }}
          errors={errors} name="password" id="password" autoComplete="new-password" className="w-full"/>
        {!errors.password && <p className='text-xs text-muted-foreground'>At least {PASSWORD_MIN} characters.</p>}
      </div>
      <Button disabled={isLoading} className="rounded-md py-2 mt-2">{isLoading ? "Creating account…" : "Create account"}</Button>
    </form>
    <div className="flex gap-3 items-center justify-center my-6">
      <hr className='border-1 border-neutral-400/50 w-full'/>
      <span className='text-sm font-semibold text-neutral-400'>OR</span>
      <hr className='border-1 border-neutral-400/50 w-full'/>
    </div>
    <div className="flex gap-2 w-full">
              <SignInWithOAuthButton provider="Google" callbackPath={callbackPath}/>
              <SignInWithOAuthButton provider="Github" callbackPath={callbackPath}/>
              {appleSignInShown && <SignInWithOAuthButton provider="Apple" callbackPath={callbackPath}/>}
    </div>
    <p className='text-sm mt-6'>Already have an account? <Link href={withCallback("/signin", callbackPath)} className={linkClass}>Sign in</Link></p>
    <p className='text-xs text-muted-foreground mt-3'>By signing up, you agree to our <Link href="/terms" className='hover:underline'>Terms</Link> and <Link href="/privacy" className='hover:underline'>Privacy Policy</Link>.</p>
  </div>
  )}
  </motion.div>
  </AnimatePresence>
  )
}

export default SignUpComponent
