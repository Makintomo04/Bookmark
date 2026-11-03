"use client"
import { FC } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Crown } from 'lucide-react'
import Modal from './Modal'
import ModalFooter from './ModalFooter'
import { buttonVariants } from '../ui/button'
import useUpgradePrompt from '@/app/hooks/useUpgradePrompt'
import { FEATURE_COPY, UPGRADE_URL } from '@/lib/entitlements'

// The Plus prompt (useUpgradePrompt): opened where a free reader picked a Plus feature, so they find out
// there and then, with what it is, instead of on a page that turns them away. A sheet on a phone and a small
// dialog from sm up, like the join prompt.
const UpgradePromptModal: FC = () => {
  const { isOpen, feature, onClose } = useUpgradePrompt()
  // Mounted from the first ask on, so closing can animate; the feature stays from that ask.
  if (!feature) return null
  const copy = FEATURE_COPY[feature]

  const body = (
    <div className="flex w-full items-start gap-3 px-6">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
        <Crown size={16} aria-hidden />
      </span>
      <p className="text-muted-foreground">{copy.message}</p>
    </div>
  )
  const footer = (
    <ModalFooter>
      <button type="button" onClick={onClose} className={buttonVariants({ variant: "ghost" })}>Not now</button>
      <Link href={UPGRADE_URL} onClick={onClose} className={buttonVariants()}>See Bookmark Plus</Link>
    </ModalFooter>
  )

  // On the body, like the join prompt, so no layout it opens from can squash it.
  return createPortal(
    <Modal title={copy.title} body={body} footer={footer} onClose={onClose} isOpen={isOpen} size="s" />,
    document.body
  )
}

export default UpgradePromptModal
