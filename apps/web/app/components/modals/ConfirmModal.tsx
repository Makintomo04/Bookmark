"use client"
import { FC } from 'react'
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

  return <Modal title={title} body={body} footer={footer} onClose={onClose} isOpen={isOpen} size="sm" compact />
}

export default ConfirmModal
