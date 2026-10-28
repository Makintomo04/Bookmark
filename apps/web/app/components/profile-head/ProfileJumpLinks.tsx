"use client"
import { FC, MouseEvent, useEffect, useState } from 'react'

// The profile's sections, by the id on each one's heading (ShelfSection) or wrapper.
const SECTIONS = [
  { id: "profile-shelf", label: "Shelf" },
  { id: "series-tracker", label: "Series" },
  { id: "profile-reviews", label: "Reviews" },
  { id: "profile-lists", label: "Lists" },
  { id: "profile-authors", label: "Authors" },
]

// Clears the sticky site header when jumping.
const HEADER_OFFSET = 88

// The row is pulled out by the links' own padding, so their text lines up with the page's edge.
// A row of links under the shelf toolbar to each section of your profile, so lists and authors are one tap
// away however long the shelf above them is. Only sections on the page get a link: they load on their
// own, so it looks again as the page fills in.
const ProfileJumpLinks: FC = () => {
  const [present, setPresent] = useState<Set<string>>(new Set())

  useEffect(() => {
    const check = () => {
      const found = new Set(SECTIONS.filter((s) => document.getElementById(s.id)).map((s) => s.id))
      setPresent((prev) => (prev.size === found.size && Array.from(found).every((id) => prev.has(id)) ? prev : found))
      return found.size === SECTIONS.length
    }
    if (check()) return
    const observer = new MutationObserver(() => { if (check()) observer.disconnect() })
    observer.observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true })
    // Sections that never show (no reviews yet) shouldn't keep it watching.
    const stop = setTimeout(() => observer.disconnect(), 15_000)
    return () => { observer.disconnect(); clearTimeout(stop) }
  }, [])

  const jump = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET, behavior: "smooth" })
  }

  const links = SECTIONS.filter((s) => present.has(s.id))
  if (links.length < 2) return null
  return (
    <nav aria-label="Sections of your profile" className="-mx-2.5 sm:-mx-3 -mt-2 mb-6 flex sm:gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links.map((s) => (
        <a key={s.id} href={`#${s.id}`} onClick={(e) => jump(e, s.id)}
          className="inline-flex h-8 shrink-0 items-center rounded-full px-2.5 sm:px-3 text-sm text-muted-foreground transition hover:bg-neutral-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-neutral-900">
          {s.label}
        </a>
      ))}
    </nav>
  )
}

export default ProfileJumpLinks
