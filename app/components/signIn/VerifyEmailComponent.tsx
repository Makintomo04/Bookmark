"use client"
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '../ui/button'
import { afterSignInPath, safeCallbackPath, withCallback } from '@/lib/callbackUrl'

const VerifyEmailComponent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') ?? null
  const email = searchParams?.get('email') ?? null
  const callbackPath = safeCallbackPath(searchParams?.get("callbackUrl"))
  const [state, setState] = useState<"idle" | "verifying" | "done" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  // Verifying takes a click rather than happening on load, so mail scanners that open links don't do it.
  // Confirming also signs in (the "verify-email" provider), then "/" sends new readers to onboarding.
  const verify = async () => {
    setState("verifying")
    const res = await signIn("verify-email", { email, token, redirect: false }).catch(() => null)
    if (res?.ok) {
      setState("done")
      router.push(afterSignInPath(callbackPath))
      return
    }
    setError(res?.error && res.error !== "CredentialsSignin" ? res.error : "Something went wrong. Please try again.")
    setState("error")
  }

  const signInHref = withCallback(`/signin${email ? `?email=${encodeURIComponent(email)}` : ""}`, callbackPath)

  return (
    <div className='w-screen h-screen sm:w-[500px] sm:h-auto rounded-none p-10 sm:p-6 bg-background sm:bg-popover sm:border sm:rounded-xl'>
      <div className="flex justify-center items-center gap-3 mb-6">
        <Image src='/logo.svg' width={40} height={40} alt='Bookmark'/>
      </div>
      <h1 className="page-title mb-6 text-center">Confirm your email</h1>
      {!token || !email ? (
        <p className='text-center text-sm'>This verification link is invalid. <Link href="/signin" className='text-[#F13C3C] font-semibold hover:underline'>Sign in</Link> to get a new one.</p>
      ) : state === "done" ? (
        <p role="status" className="text-center text-sm">Email confirmed. Taking you to Bookmark…</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-center">Confirm that <span className="font-semibold break-all">{email}</span> is your email to finish setting up your Bookmark account.</p>
          <p className="text-center text-muted-foreground">Didn&apos;t sign up for Bookmark? Close this page and nothing will happen.</p>
          {state === "error" && (
            <p role="alert" className="rounded-md bg-danger/10 text-danger px-3 py-2">
              {error} <Link href={signInHref} className='font-semibold underline'>Sign in</Link> to get a new link.
            </p>
          )}
          <Button type="button" onClick={verify} disabled={state === "verifying"} className="rounded-md py-2">
            {state === "verifying" ? "Confirming…" : "Confirm and continue"}
          </Button>
        </div>
      )}
    </div>
  )
}

export default VerifyEmailComponent
