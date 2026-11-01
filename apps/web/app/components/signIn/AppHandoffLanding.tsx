"use client"
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { mutate } from 'swr'
import { afterSignInPath, safeCallbackPath } from '@/lib/callbackUrl'

// Where the app's "open the web signed in" link lands (lib/appHandoff.ts). The one-time token is in the
// fragment, so it never reached the server with the page; it's read, wiped from the address bar, and spent
// straight away. Unlike an emailed link nothing scans this one first, so there's no button to press.
const AppHandoffLanding = () => {
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.hash.slice(1))
    const token = params.get('token')
    const next = safeCallbackPath(params.get('next'))
    window.history.replaceState(null, '', window.location.pathname)
    if (!token) {
      setError("This link is incomplete. Open it from the app again.")
      return
    }
    signIn('app-handoff', { token, redirect: false })
      .then(async (res) => {
        if (!res?.ok) {
          setError(res?.error && res.error !== 'CredentialsSignin' ? res.error : "This link has expired. Open it from the app again.")
          return
        }
        await mutate('/api/user')
        window.location.replace(afterSignInPath(next))
      })
      .catch(() => setError("Something went wrong. Open it from the app again."))
  }, [])

  return (
    <div className='w-full min-h-dvh sm:w-[500px] sm:min-h-0 rounded-none py-10 sm:p-6 bg-background sm:bg-popover sm:border sm:rounded-xl'>
      <div className="flex justify-center items-center gap-3 mb-6">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Image src='/logo.svg' width={40} height={40} alt='Bookmark home'/></Link>
      </div>
      <h1 className="page-title mb-6 text-center">{error ? "Couldn't sign you in" : "Signing you in…"}</h1>
      <p className='text-center text-sm' role={error ? 'alert' : 'status'}>
        {error ?? "One moment, carrying on from the app."}
        {error && <> Or <Link href="/signin" className='text-brand-text font-semibold hover:underline'>sign in here</Link>.</>}
      </p>
    </div>
  )
}

export default AppHandoffLanding
