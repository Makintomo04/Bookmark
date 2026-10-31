"use client";
import { FC, useCallback, useEffect, useId, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react';
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
  // No header: the body runs to the top edge (the medal celebration's colour band). The title stays, for screen readers.
  bare?: boolean;
  // Beside the close button, e.g. book details' "Open book page".
  headerAction?: React.ReactNode;
  // On a phone, a sheet docked to the bottom at its own height (the join prompt), not the full screen.
  sheet?: boolean;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Modals can stack, so the first one to open freezes the page and the last one to close restores it.
let lockCount = 0
let savedOverflow = ''
function lockPageScroll() {
  if (lockCount++ === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  return () => {
    if (--lockCount === 0) document.body.style.overflow = savedOverflow
  }
}

const Modal: FC<ModalProps> = ({isOpen,onClose,title,body,footer,disabled,closeOnBackdrop = true,compact = false,size = "default",bare = false,headerAction,sheet = false}) => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    if(disabled) return
    onClose()
  },[disabled,onClose])

  // Read through a ref so a parent re-render doesn't re-run the focus effect below.
  const closeRef = useRef(handleClose)
  closeRef.current = handleClose

  // Modals live in the layout and open from global stores, so they'd outlive a page change. A link inside one
  // (See Bookmark Plus, Settings, a book) navigates away, and the modal goes with the page it was opened on.
  const pathname = usePathname()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    if (isOpen) onCloseRef.current()
  }, [pathname, isOpen])

  // Freeze the page behind, otherwise a swipe on the header, footer or past the end of the body scrolls the page.
  useEffect(() => {
    if (!isOpen) return
    return lockPageScroll()
  }, [isOpen])

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
        h-dvh
        flex
        overflow-x-hidden
        overflow-y-hidden
        fixed
        inset-0
        z-50
        outline-none
        focus:outline-none
        overscroll-contain
        bg-black/40

      "
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        // The page's own background with a thin neutral edge, as the Update sheet has (profile-head/UpdateSheet.tsx),
        // over a dimmed page. Full screen on a phone, so the edge and corners are from sm up; a `sheet` instead rises
        // from the bottom at its own height, with a top edge and corners.
        className={cn("flex flex-col sm:my-auto w-full sm:max-h-[85dvh] overflow-hidden sm:rounded-xl sm:h-auto",
          sheet ? "mt-auto h-auto max-h-[85dvh] rounded-t-2xl border-t border-neutral-200 dark:border-neutral-800" : "mb-auto h-full max-h-dvh", size === "sm" ? "sm:w-[520px]" : "sm:w-[650px] md:w-[800px] lg:w-[900px]", "bg-background sm:border sm:border-neutral-200 sm:dark:border-neutral-800 shadow-2xl relative outline-none", !compact && "sm:min-h-[min(580px,85dvh)]")}
      >
        {bare ? (
          <>
            {title && <h2 id={titleId} className="sr-only">{title}</h2>}
            <button type="button" aria-label="Close" className="absolute right-4 top-4 z-10 p-2 bg-background/80 hover:bg-background cursor-pointer transition rounded-full" onClick={handleClose}>
              <X size={20} aria-hidden />
            </button>
          </>
        ) : (
        /* The header never shrinks: on short windows the body scrolls instead of sliding up over the title. */
        <div className="p-6 pb-0 shrink-0">
          <div className="flex justify-between items-center">
          <h2 id={titleId} className='text-3xl font-bold'>{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
          {headerAction}
          <button type="button" aria-label="Close" className="p-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer transition rounded-full" onClick={handleClose}>
          <X size={20} aria-hidden />
          </button>
          </div>
          </div>
          <hr className='my-6 border-1 border-neutral-400/40'/>
        </div>
        )}
          <div className="flex flex-col justify-between w-full min-h-0 flex-1 relative">
        {/* grid-cols-1 caps the column at the modal's width; an auto column grows to the widest child and spills off narrow screens. */}
        <div className={cn("h-auto grid grid-cols-1 place-items-baseline sm:place-items-center overflow-y-auto overflow-x-hidden overscroll-contain flex-grow min-h-0 max-h-max", !bare && "py-2 -mt-2")}>

        {body}
        </div>
        <div className="pt-2">
        {footer}

          </div>
        </div>
      </div>
    </div>
  )
}

export default Modal
