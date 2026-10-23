'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FC, useEffect, useRef, useState, useTransition } from 'react'
import { Check, Copy, Home, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import Logo from './Logo'
import { primaryButtonClass, secondaryButtonClass } from './profile-head/ProfileHeader'

interface ErrorStateProps {
  error: Error & { digest?: string }
  reset: () => void
  // Auth pages have no header, so they fill the screen and carry the logo themselves.
  fullScreen?: boolean
}

// An open book with our bookmark slipping out of it - "we lost your place".
const LostBookmark = () => (
  <svg viewBox="0 0 120 84" className="w-36 h-auto" aria-hidden>
    <g fill="none" strokeWidth="2" strokeLinejoin="round" className="stroke-neutral-300 dark:stroke-neutral-700">
      <path d="M60 20C48 12 30 10 12 14v52c18-4 36-2 48 6Z" />
      <path d="M60 20c12-8 30-10 48-6v52c-18-4-36-2-48 6Z" />
      <path d="M60 20v52" />
    </g>
    <g transform="translate(84 40) rotate(24) scale(0.95)">
      <path
        d="M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z"
        className="fill-brand"
      />
    </g>
  </svg>
)

const ErrorState: FC<ErrorStateProps> = ({ error, reset, fullScreen }) => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    console.error(error)
    // Move focus here so keyboard and screen reader users land on the message, not mid-page.
    headingRef.current?.focus()
  }, [error])

  // Errors thrown by server components need fresh data, not just a re-render,
  // so refresh the route and reset the boundary together.
  const retry = () => startTransition(() => { router.refresh(); reset() })

  const copyDigest = async () => {
    if (!error.digest) return
    try {
      await navigator.clipboard.writeText(error.digest)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-16', fullScreen ? 'min-h-screen' : 'min-h-[65vh]')}>
      {fullScreen && (
        <Link href="/" className="mb-12 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>
      )}
      <div role="alert" className="flex flex-col items-center text-center max-w-md">
        <LostBookmark />
        <h1 ref={headingRef} tabIndex={-1} className="page-title mt-8 focus:outline-none">
          We lost your place
        </h1>
        <p className="mt-3 text-muted-foreground">
          Something went wrong while loading this page. It&apos;s usually temporary, so trying again often fixes it.
        </p>

        <div className="mt-8 flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
          <Link href="/" className={cn(secondaryButtonClass, 'h-10')}>
            <Home size={16} aria-hidden />Back to home
          </Link>
          <button type="button" onClick={retry} disabled={isPending} className={cn(primaryButtonClass, 'h-10')}>
            {isPending
              ? <Loader2 size={16} className="animate-spin" aria-hidden />
              : <RotateCcw size={16} aria-hidden />}
            {isPending ? 'Retrying…' : 'Try again'}
          </button>
        </div>

        {error.digest && (
          <p className="mt-10 text-xs text-muted-foreground">
            Still stuck? Share this reference if you get in touch:{' '}
            <button
              type="button"
              onClick={copyDigest}
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono bg-neutral-100 dark:bg-neutral-900 hover:text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={copied ? 'Reference copied' : `Copy error reference ${error.digest}`}
            >
              {error.digest}
              {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
            </button>
          </p>
        )}

        {process.env.NODE_ENV === 'development' && error.message && (
          <details className="mt-8 w-full text-left text-xs rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-3">
            <summary className="cursor-pointer text-muted-foreground">Error details (dev only)</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{error.message}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

export default ErrorState
