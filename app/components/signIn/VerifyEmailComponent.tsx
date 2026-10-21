"use client"
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import axios from 'axios'
import { useSearchParams } from 'next/navigation'
import { Button } from '../ui/button'
import { safeCallbackPath, withCallback } from '@/lib/callbackUrl'

const VerifyEmailComponent = () => {
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') ?? null
  const email = searchParams?.get('email') ?? null
  const [state, setState] = useState<"idle" | "verifying" | "done" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  // Verifying takes a click rather than happening on load, so mail scanners that open links don't do it.
  const verify = async () => {
    try {
      setState("verifying")
      await axios.post("/api/auth/verify-email", { token, email })
      setState("done")
    } catch (err) {
      setError(axios.isAxiosError(err) && err.response?.data?.error || "Something went wrong.")
      setState("error")
    }
  }

  const callbackPath = safeCallbackPath(searchParams?.get("callbackUrl"))
  const signInHref = withCallback(`/signin?verified=1${email ? `&email=${encodeURIComponent(email)}` : ""}`, callbackPath)

  return (
    <div className='w-screen h-screen sm:w-[500px] sm:h-auto rounded-none p-10 sm:p-6 bg-slate-100 dark:bg-background sm:rounded-lg'>
      <div className="flex justify-center items-center gap-3 mb-6">
        <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      </div>
      <h1 className="text-2xl font-bold mb-6 text-center">Confirm your email</h1>
      {!token || !email ? (
        <p className='text-center text-sm'>This verification link is invalid. <Link href="/signin" className='text-[#F13C3C] font-semibold hover:underline'>Sign in</Link> to get a new one.</p>
      ) : state === "done" ? (
        <div className="flex flex-col gap-4 text-center text-sm">
          <p>Your email is confirmed. You can sign in now.</p>
          <Link href={signInHref} className='bg-red-500 text-white rounded-md py-2 font-medium hover:bg-red-600 transition'>Sign in</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-center">Confirm that <span className="font-semibold break-all">{email}</span> is your email to finish setting up your Bookmark account.</p>
          <p className="text-center text-muted-foreground">Didn&apos;t sign up for Bookmark? Close this page and nothing will happen.</p>
          {state === "error" && (
            <p role="alert" className="rounded-md bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-3 py-2">
              {error} <Link href="/signin" className='font-semibold underline'>Sign in</Link> to get a new link.
            </p>
          )}
          <Button type="button" onClick={verify} disabled={state === "verifying"} className="bg-red-500 text-white rounded-md py-2">
            {state === "verifying" ? "Confirming…" : "Confirm my email"}
          </Button>
        </div>
      )}
    </div>
  )
}

export default VerifyEmailComponent
