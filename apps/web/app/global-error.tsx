'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// This is the last-resort boundary - it only fires when something in the root
// layout itself throws, so globals.css, Tailwind and app components may not be
// available. Everything here is inline and dependency-free, and mirrors
// app/components/ErrorState.tsx as closely as that allows.
const css = `
  :root { --bg: #fff; --fg: #0a0a0a; --muted: #737373; --line: #d4d4d4; --chip: #f5f5f5; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0a0a0a; --fg: #fafafa; --muted: #a3a3a3; --line: #404040; --chip: #171717; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 1rem; text-align: center; }
  h1 { margin: 2rem 0 0; font-size: 1.875rem; font-weight: 700; letter-spacing: -0.02em; }
  p { margin: 0.75rem 0 0; max-width: 28rem; color: var(--muted); line-height: 1.5; }
  .actions { margin-top: 2rem; display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; }
  .btn { height: 2.5rem; padding: 0 1rem; border-radius: 0.375rem; font: 500 0.875rem/1 inherit; display: inline-flex; align-items: center; cursor: pointer; text-decoration: none; transition: opacity .15s, background .15s; }
  .btn:focus-visible { outline: 2px solid #a3a3a3; outline-offset: 2px; }
  .primary { background: var(--fg); color: var(--bg); border: none; }
  .primary:hover { opacity: .9; }
  .secondary { background: transparent; color: var(--fg); border: 1px solid var(--line); }
  .secondary:hover { background: var(--chip); }
  .ref { margin-top: 2.5rem; font-size: 0.75rem; }
  code { padding: 0.125rem 0.375rem; border-radius: 0.25rem; background: var(--chip); color: var(--fg); }
`

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Reported to Sentry (BOO-54); the digest ties it to the server-side event for the same failure.
  useEffect(() => {
    console.error(error)
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <head>
        <title>Something went wrong | Bookmark</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main className="wrap" role="alert">
          <svg viewBox="0 0 30 31" width="48" height="49" aria-hidden>
            <path d="M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z" fill="#F13C3C" />
          </svg>
          <h1>We lost your place</h1>
          <p>Bookmark ran into a problem and couldn&apos;t load. It&apos;s usually temporary, so trying again often fixes it.</p>
          <div className="actions">
            {/* A full reload, since the root layout itself is what failed. Link would navigate client-side. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn secondary">Back to home</a>
            <button type="button" onClick={() => reset()} className="btn primary">Try again</button>
          </div>
          {error.digest && (
            <p className="ref">Still stuck? Share this reference if you get in touch: <code>{error.digest}</code></p>
          )}
        </main>
      </body>
    </html>
  )
}
