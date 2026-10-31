"use client"
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '../ui/button'

// Where the emailed sign-in link lands. Signing in takes a click, not a page load, so mail scanners
// that open links to check them don't spend the one-time token first (see lib/magicLink.ts).
const MagicLinkLanding = () => {
  const searchParams = useSearchParams()
  const next = searchParams?.get('next') ?? ''
  // Only ever forwards to NextAuth's own email callback on this site.
  const valid = next.startsWith('/api/auth/callback/email?')
  const [going, setGoing] = useState(false)

  return (
    <div className='w-full min-h-dvh sm:w-[500px] sm:min-h-0 rounded-none py-10 sm:p-6 bg-background sm:bg-popover sm:border sm:rounded-xl'>
      <div className="flex justify-center items-center gap-3 mb-6">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Image src='/logo.svg' width={40} height={40} alt='Bookmark home'/></Link>
      </div>
      <h1 className="page-title mb-6 text-center">Sign in to Bookmark</h1>
      {!valid ? (
        <p className='text-center text-sm'>This sign-in link is invalid. <Link href="/signin" className='text-brand-text font-semibold hover:underline'>Request a new one</Link>.</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-center">You&apos;re one click away. The link works once and expires an hour after it was sent.</p>
          <Button type="button" loading={going} onClick={() => { setGoing(true); window.location.assign(next) }} className="rounded-md py-2">
            {going ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-muted-foreground">Didn&apos;t ask for this link? Close this page and nothing will happen.</p>
        </div>
      )}
    </div>
  )
}

export default MagicLinkLanding
