"use client"
import { FC } from 'react'
import { createPortal } from 'react-dom'
import Modal from './Modal'
import { Button } from '../ui/button'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  description: string
  confirmLabel: string
  // Red for things that are hard to take back (blocking, deleting).
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}

// Our own take on window.confirm, in the same sheet as every other modal.
const ConfirmModal: FC<ConfirmModalProps> = ({ isOpen, title, description, confirmLabel, destructive = false, onConfirm, onClose }) => {
  const body = (
    <p className="w-full px-6 pb-2 text-base text-muted-foreground">{description}</p>
  )

  const footer = (
    <div className="w-full p-6 flex items-center justify-end gap-3">
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  )

  // It opens from inside other layouts (the profile's action row sizes its children with max-sm:[&>*]:h-8, which would
  // squash the overlay to 32px on a phone), so it lives on the body instead.
  if (!isOpen) return null
  return createPortal(
    <Modal title={title} body={body} footer={footer} onClose={onClose} isOpen={isOpen} size="sm" compact />,
    document.body
  )
}

export default ConfirmModal
