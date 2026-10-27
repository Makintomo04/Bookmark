"use client"
import { useEffect, useState } from 'react'
import { Input } from '../ui/input'
import { PasswordInput } from '../ui/password-input'
import { signIn } from 'next-auth/react'
import { mutate } from 'swr'
import Image from 'next/image'
import Link from 'next/link'
import SignInWithOAuthButton, { appleSignInShown } from './SignInWithOAuthButton'
import { Button } from '../ui/button'
import { useRouter } from 'next/navigation'
import { motion,AnimatePresence } from 'framer-motion'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import { EMAIL_NOT_VERIFIED } from '@/lib/authSchemas'
import CheckInboxNotice from './CheckInboxNotice'
import { afterSignInPath, safeCallbackPath, withCallback } from '@/lib/callbackUrl'

// NextAuth sends failed provider and magic-link sign-ins back here as ?error=<code>.
const errorMessages: Record<string, string> = {
  OAuthAccountNotLinked: "An account with this email already exists. Sign in with the method you used to create it, or email yourself a sign-in link.",
  Verification: "That sign-in link has expired or was already used. Request a new one below.",
  suspended: "This account is suspended. Email support if you think that's a mistake.",
  EmailSignin: "We couldn't send the sign-in link. If you've asked for a few, wait a few minutes and try again.",
}
const genericError = "Sign-in failed. Please try again."

const linkClass = 'text-brand-text font-semibold hover:underline hover:underline-offset-2 transition'

const SignInComponent =  () => {

  const router = useRouter()

  // Until hydration, a click would submit the form natively instead of through onSubmit
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [authError, setAuthError] = useState<string | null>(null)
  // A wrong password gets its own message, with the ways back in.
  const [wrongPassword, setWrongPassword] = useState(false)
  const [justVerified, setJustVerified] = useState(false)
  // Set when the password was right but the email still needs confirming.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  // Set once a magic link is on its way; the form is swapped for a check-your-inbox panel.
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null)
  const [sendingLink, setSendingLink] = useState(false)
  // Where to go after signing in, e.g. the invite or page that sent them here.
  const [callbackPath, setCallbackPath] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    trigger,
    formState:{errors, isSubmitting},
  } = useForm<FieldValues>({
    defaultValues: {
      email: "",
      password:"",
    },
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCallbackPath(safeCallbackPath(params.get("callbackUrl"), window.location.origin))
    if (params.get("verified") === "1") setJustVerified(true)
    const email = params.get("email")
    if (email) setValue("email", email)
    const code = params.get("error")
    if (code) setAuthError(errorMessages[code] ?? genericError)
  }, [setValue])

  const clearMessages = () => {
    setUnverifiedEmail(null)
    setWrongPassword(false)
    setAuthError(null)
  }

  const onSubmit:SubmitHandler<FieldValues> = async (data) => {
    clearMessages()
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
      })
      if(res?.ok){
        // Replace the signed-out /api/user answer cached from this page before moving on.
        await mutate("/api/user")
        router.push(afterSignInPath(callbackPath))
      }
      else if(res?.error === EMAIL_NOT_VERIFIED){
        setUnverifiedEmail(data.email)
      }
      else if(!res?.error || res.error === "Invalid email or password" || res.error === "CredentialsSignin"){
        setWrongPassword(true)
      }
      else{
        // e.g. the rate limiter's "Too many attempts" message.
        setAuthError(res.error)
      }
    }
    catch (error) {
      setAuthError(genericError)
    }
  }

  // Uses the email field above, so it only needs the email to be valid, not a password.
  const sendLink = async () => {
    clearMessages()
    if (!(await trigger("email"))) return
    const email = String(getValues("email")).trim()
    try {
      setSendingLink(true)
      const res = await signIn("email", {
        email,
        redirect: false,
        callbackUrl: `${window.location.origin}${afterSignInPath(callbackPath)}`,
      })
      if (res?.error) setAuthError(errorMessages.EmailSignin)
      else setLinkSentTo(email)
    } catch (error) {
      setAuthError(errorMessages.EmailSignin)
    } finally {
      setSendingLink(false)
    }
  }

  let initial = {};
  let animate = {};
  let transition = {};
  let exit = {};

  if (typeof window !== "undefined") {

    const isMobile = window.innerWidth < 640;

  if (!isMobile) {

      initial={ opacity: 1,y:-50 },
      animate={ opacity: 1,y:0 },
      transition={ ease: "circIn" },
      exit={ opacity: 1,y:-50 }

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
    <div className="w-full">
    <h1 className="page-title mb-10 text-center">{linkSentTo ? "Check your inbox" : "Welcome back"}</h1>
  </div>
  {linkSentTo ? (
    <div role="status" className="flex flex-col gap-4 text-sm">
      <div className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 flex flex-col gap-2">
        <p>We sent a sign-in link to <span className="font-semibold break-all">{linkSentTo}</span>.</p>
        <p className="text-muted-foreground">It works once and expires in 1 hour. Can&apos;t find it? Check your spam folder. No account yet? The link creates one.</p>
      </div>
      <button type="button" onClick={() => setLinkSentTo(null)} className={`${linkClass} self-start`}>Use a different email</button>
    </div>
  ) : (
  <div className="">
    {justVerified && !unverifiedEmail && <p role="status" className="mb-4 rounded-md bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 text-sm px-3 py-2">Email confirmed. Sign in to continue.</p>}
    {unverifiedEmail && <div className="mb-4"><CheckInboxNotice email={unverifiedEmail} title="Confirm your email to sign in"/></div>}
    {wrongPassword && (
      <p role="alert" className="mb-4 rounded-md bg-danger/10 text-danger text-sm px-3 py-2">
        That email and password don&apos;t match. <Link href="/forgot-password" className="font-semibold underline">Reset your password</Link>, or email yourself a sign-in link. That also works if you signed up with Google or GitHub.
      </p>
    )}
    {authError && <p role="alert" className="mb-4 rounded-md bg-danger/10 text-danger text-sm px-3 py-2">{authError}</p>}
    <form method="post" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-2">
        <label htmlFor="email">Email</label>
        <Input register={register} errors={errors} inputValidation={{required:true, message:"Enter your email."}} type="email" name="email" id="email" autoComplete="email" className="w-full" required/>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password">Password</label>
          <Link href="/forgot-password" className='text-sm text-brand-text hover:underline'>Forgot password?</Link>
        </div>
        <PasswordInput register={register} errors={errors} inputValidation={{required:true, message:"Enter your password."}} name="password" id="password" autoComplete="current-password" className="w-full" required/>
      </div>
      <Button type="submit" disabled={!mounted || isSubmitting || sendingLink} className="rounded-md py-2 mt-2">{isSubmitting ? "Signing in…" : "Sign in"}</Button>
      <Button type="button" variant="outline" onClick={sendLink} disabled={!mounted || isSubmitting || sendingLink} className="rounded-md py-2 dark:border-neutral-100/50">
        {sendingLink ? "Sending link…" : "Email me a sign-in link instead"}
      </Button>
    </form>
    <div className="flex gap-3 items-center justify-center my-6 w-full">
      <hr className='border-1 border-neutral-400/50 w-full'/>
      <span className='text-sm font-semibold text-neutral-400'>OR</span>
      <hr className='border-1 border-neutral-400/50 w-full'/>
    </div>
    <div className="flex gap-2 w-full">
              <SignInWithOAuthButton provider="Google" callbackPath={callbackPath}/>
              <SignInWithOAuthButton provider="Github" callbackPath={callbackPath}/>
              {appleSignInShown && <SignInWithOAuthButton provider="Apple" callbackPath={callbackPath}/>}
    </div>
    <p className='text-sm mt-6'>First time using Bookmark? <Link href={withCallback("/register", callbackPath)} className={linkClass}>Create an account</Link></p>
  </div>
  )}
  </motion.div>
  </AnimatePresence>
  )
}

export default SignInComponent
