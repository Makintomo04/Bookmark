"use client";
import { FC, useCallback, useEffect, useId, useRef } from 'react'
import { IoClose } from 'react-icons/io5';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  title?:string;
  body?:React.ReactElement;
  footer?:React.ReactElement;
  actionLabel?:string;
  disabled?:boolean;
  secondaryAction?: () => void;
  secondaryActionLabel?:string;
  closeOnBackdrop?: boolean;
  compact?: boolean;
  size?: "default" | "sm";
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

const Modal: FC<ModalProps> = ({isOpen,onClose,title,body,footer,disabled,closeOnBackdrop = true,compact = false,size = "default"}) => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    if(disabled) return
    onClose()
  },[disabled,onClose])

  // Read through a ref so a parent re-render doesn't re-run the focus effect below.
  const closeRef = useRef(handleClose)
  closeRef.current = handleClose

  useEffect(() => {
    if (!isOpen) return
    const returnTo = document.activeElement as HTMLElement | null
    const node = dialogRef.current
    if (node && !node.contains(document.activeElement)) node.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const focusables = node.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnTo?.focus?.()
    }
  }, [isOpen])

  if(!isOpen) return null
  return (
    <div
    onClick={closeOnBackdrop ? handleClose : undefined}
      className="
        justify-center
        items-center
        h-screen
        flex
        overflow-x-hidden
        overflow-y-hidden
        fixed
        inset-0
        z-50
        outline-none
        focus:outline-none
        bg-neutral-800/70

      "
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn("flex flex-col mb-auto sm:my-auto w-full h-full max-h-dvh sm:max-h-[85dvh] overflow-hidden sm:rounded-lg sm:h-auto", size === "sm" ? "sm:w-[520px]" : "sm:w-[650px] md:w-[800px] lg:w-[900px]", " bg-background shadow-md relative outline-none", !compact && "min-h-[580px]")}
      >
        <div className="p-6 pb-0 h-auto md:h-full overflow-hidden">
          <div className="flex justify-between items-center">
          <h2 id={titleId} className='text-3xl font-bold'>{title}</h2>
          <button type="button" aria-label="Close" className="p-2 bg-slate-200 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 cursor-pointer transition rounded-full" onClick={handleClose}>
          <IoClose size={24} />
          </button>
          </div>
          <hr className='my-6 border-1 border-slate-400/40'/>
        </div>
          <div className={cn("flex flex-col justify-between w-full h-full min-h-0 flex-1 relative", !compact && "min-h-[500px]")}>
        <div className="h-auto grid place-items-baseline sm:place-items-center overflow-y-auto flex-grow sm:min-h-0  max-h-max pt-2 -mt-2">

        {body}
        </div>
        <div className="">
        <hr className='mt-4 border-1 border-slate-400/40'/>

        {footer}

          </div>
        </div>
      </div>
    </div>
  )
}

export default Modal
