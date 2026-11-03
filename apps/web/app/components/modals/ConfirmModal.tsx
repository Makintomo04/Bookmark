"use client"
import { FC, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Modal from './Modal'
import ModalFooter from './ModalFooter'
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
  // Mounted from the first open on, so closing can animate (and document.body is only touched in the browser).
  const [opened, setOpened] = useState(isOpen)
  useEffect(() => { if (isOpen) setOpened(true) }, [isOpen])
  const body = (
    <p className="w-full px-6 text-muted-foreground">{description}</p>
  )

  const footer = (
    <ModalFooter>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{confirmLabel}</Button>
    </ModalFooter>
  )

  // It opens from inside other layouts (the profile's action row sizes its children with max-sm:[&>*]:h-8, which would
  // squash the overlay to 32px on a phone), so it lives on the body instead.
  if (!opened) return null
  return createPortal(
    <Modal title={title} body={body} footer={footer} onClose={onClose} isOpen={isOpen} size="s" />,
    document.body
  )
}

export default ConfirmModal
