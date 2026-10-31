"use client"
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '../ui/button'

// What each kind of email is called here, from the token (lib/unsubscribeToken.ts).
const KINDS = {
  weekly: { name: "the weekly email", what: "You’ll stop getting “Your week in books”. Nothing else changes." },
  checkpoints: { name: "checkpoint reminders", what: "You’ll stop getting reminders before a circle section is due, by email and on your phone." },
} as const

// Where the weekly email's "stop the weekly email" link lands. Stopping takes a click, not a page load,
// so mail scanners that open links to check them don't unsubscribe the reader (app/api/email/unsubscribe).
const UnsubscribeLanding = () => {
  const token = useSearchParams()?.get('t') ?? ''
  const kind = KINDS[token.split('.')[1] as keyof typeof KINDS] ?? KINDS.weekly
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')

  const stop = async () => {
    setState('sending')
    const res = await fetch(`/api/email/unsubscribe?t=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => null)
    setState(res?.ok ? 'done' : 'failed')
  }

  return (
    <div className='w-full max-w-sm sm:max-w-none sm:w-[500px] sm:p-6 bg-background sm:bg-popover sm:border sm:rounded-xl'>
      <div className="flex justify-center items-center gap-3 mb-6">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Image src='/logo.svg' width={40} height={40} alt='Bookmark home'/></Link>
      </div>
      <h1 className="page-title mb-6 text-center">{state === 'done' ? `You won’t get ${kind.name}` : `Stop ${kind.name}?`}</h1>
      <div className="flex flex-col gap-4 text-sm">
        {state === 'done' ? (
          <p className="text-center">That’s the last one. You can turn it back on any time in <Link href="/settings#notifications" className='text-brand-text font-semibold hover:underline'>Settings</Link>.</p>
        ) : !token || state === 'failed' ? (
          <p className="text-center">This link isn’t working. You can turn {kind.name} off in <Link href="/settings#notifications" className='text-brand-text font-semibold hover:underline'>Settings</Link> instead.</p>
        ) : (
          <>
            <p className="text-center text-muted-foreground">{kind.what}</p>
            <div className="flex flex-col gap-2 mt-2">
              <Button type="button" loading={state === 'sending'} onClick={stop} className="rounded-md py-2">
                {state === 'sending' ? 'Stopping…' : `Stop ${kind.name}`}
              </Button>
              <Button asChild variant="ghost" className="rounded-md py-2 text-muted-foreground">
                <Link href="/">Keep {kind.name}</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default UnsubscribeLanding
