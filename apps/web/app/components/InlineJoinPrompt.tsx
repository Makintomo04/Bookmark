"use client"
import { FC, useEffect, useRef } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { hereForCallback } from '@/app/hooks/useJoinPrompt'
import { primaryButtonClass, secondaryButtonClass } from './profile-head/ProfileHeader'

// The join prompt inside something that's already a dialog (book details), so it never stacks a second modal
// on the first: the members-only button opens this in place, on a line of its own (basis-full in a wrapping
// row). Same words and choices as JoinPromptModal; sign-up and sign-in bring them back to this page.
const InlineJoinPrompt: FC<{ heading: string; onClose: () => void }> = ({ heading, onClose }) => {
  const ref = useRef<HTMLDivElement>(null)
  // Move focus into it, so keyboard and screen-reader users land on what just appeared.
  useEffect(() => { ref.current?.focus() }, [])
  const back = hereForCallback()
  return (
    <div ref={ref} tabIndex={-1} role="group" aria-labelledby="inline-join-heading" className="basis-full mt-2 flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 outline-none dark:border-neutral-800">
      <div className="flex flex-col gap-1">
        <p id="inline-join-heading" className="font-semibold">{heading}</p>
        <p className="text-sm text-muted-foreground">It&apos;s free, and you&apos;ll come straight back here.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/register?callbackUrl=${back}`} className={cn(primaryButtonClass, "bg-brand-fill text-white hover:bg-brand-fill-hover hover:opacity-100")}>Join Bookmark</Link>
        <Link href={`/signin?callbackUrl=${back}`} className={secondaryButtonClass}>Sign in</Link>
        <button type="button" onClick={onClose} className="inline-flex h-11 pointer-fine:h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:bg-neutral-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-neutral-900">Not now</button>
      </div>
    </div>
  )
}

export default InlineJoinPrompt
