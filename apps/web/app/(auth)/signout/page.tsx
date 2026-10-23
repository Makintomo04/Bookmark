'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import Logo from '@/app/components/Logo'
import { primaryButtonClass } from '@/app/components/profile-head/ProfileHeader'

// The menu signs out without coming here. NextAuth only sends readers to this page when its CSRF check
// fails, so it tries again with a fresh token, then offers a button rather than looping.
export default function SignOutPage() {
  const [stuck, setStuck] = useState(false)

  // A failed attempt answers with NextAuth's /signout URL instead of the callback.
  const attempt = async () => {
    setStuck(false)
    try {
      const { url } = await signOut({ callbackUrl: '/', redirect: false })
      if (!url.includes('/signout')) return window.location.assign('/')
    } catch {}
    setStuck(true)
  }

  useEffect(() => { void attempt() }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <Link href="/" className="mb-12 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Logo />
      </Link>
      <div role="status" className="flex max-w-md flex-col items-center text-center">
        {stuck ? (
          <>
            <h1 className="page-title">Couldn&apos;t sign you out</h1>
            <p className="mt-3 text-muted-foreground">Something got in the way. Try again, and if it keeps happening, refresh the page first.</p>
            <button type="button" onClick={() => void attempt()} className={cn(primaryButtonClass, 'mt-8 h-10')}>Sign out</button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Signing you out…
          </p>
        )}
      </div>
    </div>
  )
}
