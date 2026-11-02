"use client"
import { FC } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Crown } from 'lucide-react'
import Modal from './Modal'
import useUpgradePrompt from '@/app/hooks/useUpgradePrompt'
import { FEATURE_COPY, UPGRADE_URL } from '@/lib/entitlements'
import { primaryButtonClass } from '../profile-head/ProfileHeader'
import { cn } from '@/lib/utils'

// The Plus prompt (useUpgradePrompt): opened where a free reader picked a Plus feature, so they find out
// there and then, with what it is, instead of on a page that turns them away. A sheet on a phone and a small
// dialog from sm up, like the join prompt.
const UpgradePromptModal: FC = () => {
  const { isOpen, feature, onClose } = useUpgradePrompt()
  if (!isOpen || !feature) return null
  const copy = FEATURE_COPY[feature]

  const body = (
    <div className="flex w-full items-start gap-3 px-6 pb-2">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
        <Crown size={16} aria-hidden />
      </span>
      <p className="text-base text-muted-foreground">{copy.message}</p>
    </div>
  )
  const footer = (
    <div className="flex w-full flex-col-reverse gap-2 p-6 sm:flex-row sm:items-center sm:justify-end">
      <button type="button" onClick={onClose} className="inline-flex h-11 pointer-fine:h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground transition hover:bg-neutral-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-neutral-900">Not now</button>
      <Link href={UPGRADE_URL} onClick={onClose} className={cn(primaryButtonClass, "bg-brand-fill text-white hover:bg-brand-fill-hover hover:opacity-100")}>See Bookmark Plus</Link>
    </div>
  )

  // On the body, like the join prompt, so no layout it opens from can squash it.
  return createPortal(
    <Modal title={copy.title} body={body} footer={footer} onClose={onClose} isOpen size="sm" compact sheet />,
    document.body
  )
}

export default UpgradePromptModal
