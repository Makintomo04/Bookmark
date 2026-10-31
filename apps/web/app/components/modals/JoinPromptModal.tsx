"use client"
import { FC } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Modal from './Modal'
import useJoinPrompt, { hereForCallback, quietJoinPrompt } from '@/app/hooks/useJoinPrompt'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import { cn } from '@/lib/utils'

// The join prompt (BOO-53, after the persona panel and design review): shown only when a signed-out visitor
// tries something members-only, never on arrival, on scroll or on a timer. A sheet on a phone and a small
// dialog from sm up (Modal), naming what they tried. Sign-up and sign-in bring them back to this page.
const JoinPromptModal: FC = () => {
  const { isOpen, kind, heading, back: backTo, onClose } = useJoinPrompt()
  if (!isOpen) return null

  const back = backTo ? encodeURIComponent(backTo) : hereForCallback()
  const notNow = () => {
    quietJoinPrompt(kind)
    onClose()
  }

  const body = (
    <p className="w-full px-6 pb-2 text-base text-muted-foreground">It&apos;s free, and you&apos;ll come straight back here.</p>
  )
  const footer = (
    <div className="flex w-full flex-col-reverse gap-2 p-6 sm:flex-row sm:items-center sm:justify-end">
      <button type="button" onClick={notNow} className="inline-flex h-11 pointer-fine:h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground transition hover:bg-neutral-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-neutral-900">Not now</button>
      <Link href={`/signin?callbackUrl=${back}`} onClick={onClose} className={secondaryButtonClass}>Sign in</Link>
      <Link href={`/register?callbackUrl=${back}`} onClick={onClose} className={cn(primaryButtonClass, "bg-brand-fill text-white hover:bg-brand-fill-hover hover:opacity-100")}>Join Bookmark</Link>
    </div>
  )

  // On the body, like ConfirmModal, so no layout it opens from can squash it.
  return createPortal(
    <Modal title={heading} body={body} footer={footer} onClose={onClose} isOpen size="sm" compact sheet />,
    document.body
  )
}

export default JoinPromptModal
