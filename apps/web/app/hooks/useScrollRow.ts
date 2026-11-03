"use client"
import { useCallback, useEffect, useState } from 'react'

// How far the pointer must move before a press on a row becomes a drag (and the click it would make is dropped).
const DRAG_PX = 5

// A sideways row (covers, lists, tabs) with its scrollbar hidden: a mouse can drag it like a phone swipes it, and
// small arrows (RowArrows) know whether there's more to either side. Touch keeps its native swipe untouched.
// `ref` is a callback ref, so a row that only renders once its data arrives is still picked up.
export default function useScrollRow<T extends HTMLElement>() {
  const [el, ref] = useState<T | null>(null)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)

  const measure = useCallback(() => {
    if (!el) return
    setCanBack(el.scrollLeft > 1)
    setCanForward(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [el])

  useEffect(() => {
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // The row's own width, and its items', since covers loading in change how far it scrolls.
    const resized = new ResizeObserver(measure)
    resized.observe(el)
    for (const child of Array.from(el.children)) resized.observe(child)

    // Dragging with a mouse. Snapping is off while it moves, so the row follows the pointer instead of jumping.
    let start: { x: number; left: number } | null = null
    let dragged = false
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth <= el.clientWidth) return
      start = { x: e.clientX, left: el.scrollLeft }
      dragged = false
    }
    const move = (e: PointerEvent) => {
      if (!start) return
      const dx = e.clientX - start.x
      if (!dragged && Math.abs(dx) < DRAG_PX) return
      if (!dragged) {
        dragged = true
        el.setPointerCapture(e.pointerId)
        el.style.scrollSnapType = 'none'
        el.style.cursor = 'grabbing'
        el.style.userSelect = 'none'
      }
      el.scrollLeft = start.left - dx
    }
    const up = (e: PointerEvent) => {
      if (!start) return
      start = null
      if (!dragged) return
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      el.style.scrollSnapType = ''
      el.style.cursor = ''
      el.style.userSelect = ''
    }
    // A drag that ends over a cover or a button mustn't also open or press it.
    const click = (e: MouseEvent) => {
      if (!dragged) return
      dragged = false
      e.preventDefault()
      e.stopPropagation()
    }
    // Links and images would otherwise start the browser's own drag of the thing under the pointer.
    const nativeDrag = (e: DragEvent) => e.preventDefault()

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('click', click, true)
    el.addEventListener('dragstart', nativeDrag)
    return () => {
      el.removeEventListener('scroll', measure)
      resized.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('click', click, true)
      el.removeEventListener('dragstart', nativeDrag)
    }
  }, [el, measure])

  // Most of a screen's width at a time, so the arrows move on by a page of covers rather than one.
  const step = useCallback((direction: 1 | -1) => {
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }, [el])

  return { ref, canBack, canForward, step }
}

export type ScrollRow = ReturnType<typeof useScrollRow>
