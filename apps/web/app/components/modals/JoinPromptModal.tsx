"use client"
import { FC } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Modal from './Modal'
import ModalFooter from './ModalFooter'
import { buttonVariants } from '../ui/button'
import useJoinPrompt, { hereForCallback } from '@/app/hooks/useJoinPrompt'

// The join prompt (BOO-53, after the persona panel and design review): shown only when a signed-out visitor
// tries something members-only, never on arrival, on scroll or on a timer. A sheet on a phone and a small
// dialog from sm up (Modal), naming what they tried. Sign-up and sign-in bring them back to this page.
// "Not now" just closes it; it opens again on the next try.
const JoinPromptModal: FC = () => {
  const { isOpen, heading, back: backTo, onClose } = useJoinPrompt()
  // Mounted from the first ask on, so closing can animate; the heading stays from that ask.
  if (!heading) return null

  const back = backTo ? encodeURIComponent(backTo) : hereForCallback()

  const body = (
    <p className="w-full px-6 text-muted-foreground">It&apos;s free. Once you&apos;re set up, you&apos;ll come back here.</p>
  )
  const footer = (
    <ModalFooter start={<Link href={`/signin?callbackUrl=${back}`} onClick={onClose} className={buttonVariants({ variant: "outline" })}>Sign in</Link>}>
      <button type="button" onClick={onClose} className={buttonVariants({ variant: "ghost" })}>Not now</button>
      <Link href={`/register?callbackUrl=${back}`} onClick={onClose} className={buttonVariants()}>Join Bookmark</Link>
    </ModalFooter>
  )

  // On the body, like ConfirmModal, so no layout it opens from can squash it.
  return createPortal(
    <Modal title={heading} body={body} footer={footer} onClose={onClose} isOpen={isOpen} size="s" />,
    document.body
  )
}

export default JoinPromptModal
