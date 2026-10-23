"use client"
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { buttonVariants } from '../ui/button'

// The app's custom scheme (apps/mobile app config), for phones where the universal link didn't open it.
const APP_SCHEME = 'bookmark://'

const OpenInApp = () => {
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') ?? ''
  const email = searchParams?.get('email') ?? ''
  const valid = /^[a-f0-9]{64}$/.test(token) && email.includes('@')
  const appLink = `${APP_SCHEME}signin/link?token=${token}&email=${encodeURIComponent(email)}`

  return (
    <div className='w-full min-h-dvh sm:w-[500px] sm:min-h-0 rounded-none py-10 sm:p-6 bg-background sm:bg-popover sm:border sm:rounded-xl'>
      <div className="flex justify-center items-center gap-3 mb-6">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Image src='/logo.svg' width={40} height={40} alt='Bookmark home'/></Link>
      </div>
      <h1 className="page-title mb-6 text-center">Sign in to the app</h1>
      {!valid ? (
        <p className='text-center text-sm'>This sign-in link is incomplete. Ask for a new one in the app.</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-center">This link signs you in to the Bookmark app. Open it on the phone where you asked for it.</p>
          <a href={appLink} className={buttonVariants({ className: 'rounded-md py-2' })}>Open Bookmark</a>
          <p className="text-center text-muted-foreground">Signing in on the web instead? <Link href="/signin" className='text-brand-text font-semibold hover:underline'>Use the sign-in page</Link>.</p>
        </div>
      )}
    </div>
  )
}

export default OpenInApp
