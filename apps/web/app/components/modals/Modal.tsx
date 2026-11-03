"use client";
import { FC, useCallback, useEffect, useId, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// One shell for every modal (BOO-98): a sheet from the bottom on a phone, a dialog in the middle from sm up.
// S for a question or a prompt, M for a form, L for searching and browsing (a full-height sheet on a phone).
export type ModalSize = "s" | "m" | "l"

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  title?:string;
  // A quieter line under the title: the book a form is about, say.
  subtitle?: React.ReactNode;
  body?:React.ReactElement;
  // A ModalFooter, so every modal's buttons sit the same way.
  footer?:React.ReactElement;
  disabled?:boolean;
  closeOnBackdrop?: boolean;
  size?: ModalSize;
  // No header: the body runs to the top edge (the medal celebration's colour band). The title stays, for screen readers.
  bare?: boolean;
  // Beside the close button, e.g. book details' "Open book page".
  headerAction?: React.ReactNode;
  // Off for a modal with no links that's opened just before a page change and should follow the reader there
  // (the reminders sheet, offered as a join sends you on to the circle).
  closeOnNavigate?: boolean;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// How long the way out takes; the way in is 200ms (300ms for a sheet), both in the classes below.
const EXIT_MS = 150
// How far a sheet is dragged down by its handle before letting go closes it.
const DRAG_CLOSE_PX = 80

const WIDTH: Record<ModalSize, string> = {
  s: "sm:w-[448px]",
  m: "sm:w-[560px]",
  // Search results shouldn't push the box up and down as they come in, so on desktop L hangs from near the top
  // and grows downwards, where S and M sit in the middle.
  l: "sm:w-[672px] sm:mb-auto sm:mt-[8dvh]",
}

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

const Modal: FC<ModalProps> = ({isOpen = false,onClose,title,subtitle,body,footer,disabled,closeOnBackdrop = true,size = "m",bare = false,headerAction,closeOnNavigate = true}) => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    if(disabled) return
    onClose()
  },[disabled,onClose])

  // Read through a ref so a parent re-render doesn't re-run the focus effect below.
  const closeRef = useRef(handleClose)
  closeRef.current = handleClose

  // Stays on screen for the way out. Callers often clear what the modal shows as it closes, so it keeps
  // showing what it had while open rather than flashing empty.
  const [rendered, setRendered] = useState(isOpen)
  const [closing, setClosing] = useState(false)
  const shown = useRef({ title, subtitle, body, footer, headerAction })
  if (isOpen) shown.current = { title, subtitle, body, footer, headerAction }
  useEffect(() => {
    if (isOpen) {
      setRendered(true)
      setClosing(false)
      return
    }
    setClosing(true)
    const timer = setTimeout(() => {
      setRendered(false)
      setClosing(false)
    }, EXIT_MS)
    return () => clearTimeout(timer)
  }, [isOpen])

  // Modals live in the layout and open from global stores, so they'd outlive a page change. A link inside one
  // (See Bookmark Plus, Settings, a book) navigates away, and the modal goes with the page it was opened on.
  const pathname = usePathname()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    if (isOpen && closeOnNavigate) onCloseRef.current()
  }, [pathname, isOpen, closeOnNavigate])

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

  // A hairline over the footer only while the body has more to scroll, so a short modal stays one quiet card.
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const node = bodyRef.current
    if (!rendered || !node) return
    const check = () => setOverflowing(node.scrollHeight - node.clientHeight - node.scrollTop > 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)
    node.addEventListener('scroll', check, { passive: true })
    return () => {
      observer.disconnect()
      node.removeEventListener('scroll', check)
    }
  }, [rendered])

  // On a phone the handle and header drag the sheet down; past DRAG_CLOSE_PX letting go closes it.
  // The handle is hidden from sm up, and a mouse never starts a drag.
  const drag = useRef<{ startY: number; dy: number } | null>(null)
  const onDragStart = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || disabled) return
    drag.current = { startY: e.clientY, dy: 0 }
  }
  const onDragMove = (e: React.PointerEvent) => {
    const node = dialogRef.current
    if (!drag.current || !node) return
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY)
    // A few pixels of slack, so a tap on the close button is still a tap.
    if (drag.current.dy < 6) return
    node.style.transition = 'none'
    node.style.transform = `translateY(${drag.current.dy}px)`
  }
  const onDragEnd = () => {
    const node = dialogRef.current
    const dy = drag.current?.dy ?? 0
    drag.current = null
    if (!node) return
    node.style.transition = 'transform 200ms ease-out'
    node.style.transform = ''
    if (dy > DRAG_CLOSE_PX) handleClose()
  }
  const dragHandlers = { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd }

  if (!rendered) return null
  const view = shown.current
  return (
    <div
      onClick={closeOnBackdrop ? handleClose : undefined}
      className={cn(
        "fixed inset-0 z-50 flex h-dvh items-end justify-center overflow-hidden overscroll-contain bg-black/60 outline-none sm:items-center sm:p-4",
        closing ? "motion-safe:animate-out motion-safe:fade-out-0 fill-mode-forwards duration-150" : "motion-safe:animate-in motion-safe:fade-in-0 duration-200",
      )}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={view.title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        // surface-1 with shadow-float and radius-lg, as the design system has for floating layers. On a phone it
        // rises from the bottom edge at its own height (L: the full height, with the page peeking above); the
        // bottom padding clears the home bar.
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-t-2xl bg-popover text-popover-foreground shadow-float outline-none sm:max-w-full sm:rounded-2xl",
          "pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[85dvh] sm:pb-0",
          size === "l" ? "h-[calc(100dvh-1rem)]" : "max-h-[85dvh]",
          WIDTH[size],
          closing
            ? "motion-safe:animate-out motion-safe:slide-out-to-bottom-full sm:motion-safe:slide-out-to-bottom-2 sm:motion-safe:fade-out-0 fill-mode-forwards duration-150"
            : "motion-safe:animate-in motion-safe:slide-in-from-bottom-full duration-300 ease-out sm:motion-safe:slide-in-from-bottom-2 sm:motion-safe:fade-in-0 sm:duration-200",
        )}
      >
        {bare ? (
          <>
            {view.title && <h2 id={titleId} className="sr-only">{view.title}</h2>}
            <div {...dragHandlers} aria-hidden className="absolute inset-x-0 top-0 z-10 flex h-6 touch-none justify-center pt-2 sm:hidden">
              <span className="h-1 w-9 rounded-full bg-white/60" />
            </div>
            <button type="button" aria-label="Close" className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-popover/80 text-foreground transition hover:bg-popover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={handleClose}>
              <X size={20} aria-hidden />
            </button>
          </>
        ) : (
          /* The header never shrinks: on short windows the body scrolls instead of sliding up over the title. */
          <div {...dragHandlers} className="shrink-0 touch-none sm:touch-auto">
            <div aria-hidden className="flex justify-center pt-2 sm:hidden">
              <span className="h-1 w-9 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            </div>
            <div className="flex items-center gap-2 pl-6 pr-3.5 pt-2 sm:pt-4">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-semibold leading-[26px] text-balance">{view.title}</h2>
                {view.subtitle && <p className="truncate text-[13px] leading-5 text-muted-foreground">{view.subtitle}</p>}
              </div>
              {view.headerAction}
              <button type="button" aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={handleClose}>
                <X size={20} aria-hidden />
              </button>
            </div>
          </div>
        )}
        {/* grid-cols-1 caps the column at the modal's width; an auto column grows to the widest child and spills off narrow screens. */}
        <div ref={bodyRef} className={cn("grid min-h-0 flex-1 grid-cols-1 content-start overflow-y-auto overflow-x-hidden overscroll-contain", !bare && "pt-3", !view.footer && "pb-6")}>
          {view.body}
        </div>
        {view.footer && (
          <div className={cn("shrink-0 border-t transition-colors", overflowing ? "border-border" : "border-transparent")}>
            {view.footer}
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
