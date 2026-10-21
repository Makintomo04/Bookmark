"use client"
import { cn } from '@/lib/utils'
import { FC, useId } from 'react'

// The Bookmark logo (public/logo.svg) — reused so the loader is the brand mark.
const LOGO_PATH = "M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z"

interface LoaderProps {
  // Inline loaders sit inside modals and sections; page loaders fill the space
  // under the header. Kept as `notScreen` so existing callers still work.
  notScreen?: boolean
}

const Loader: FC<LoaderProps> = ({ notScreen }) => {
  // useId returns ":r0:"-style ids, which aren't safe inside url(#…).
  const clipId = `loader-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const size = notScreen ? 48 : 72
  return (
    <div
      role="status"
      className={cn(
        "flex w-full items-center justify-center",
        // Its own min-height rather than h-full: the parent <main> grows via
        // flex inside a min-h-screen wrapper, so a percentage height has
        // nothing definite to resolve against and collapsed to the top.
        notScreen ? "py-8" : "h-full min-h-[60vh]"
      )}
    >
      {/* The logo fills with brand red from the bottom, then drains out the top. */}
      <svg width={size} height={size} viewBox="0 0 30 31" aria-hidden>
        <defs>
          <clipPath id={clipId}>
            <path d={LOGO_PATH} />
          </clipPath>
        </defs>
        <path d={LOGO_PATH} className="fill-brand/15" />
        <g clipPath={`url(#${clipId})`}>
          <rect width="31" height="31" className="loader-fill fill-brand" />
        </g>
      </svg>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

export default Loader
