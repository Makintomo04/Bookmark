"use client"
import { FC, useEffect, useState } from 'react'
import { booksReadOf, tierProgress, tierRingStyle } from '@/lib/readerTier'
import { useBooksReadFor } from '@/app/hooks/useTierPreview'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import InitialAvatar, { avatarColour } from '../profile/InitialAvatar'
import { signOut } from "next-auth/react"
import { usePathname } from 'next/navigation'
import useUser from '@/app/hooks/useUser'
import NotificationBell from './NotificationBell'
import Link from 'next/link'
import { BarChart3, ChevronRight, Compass, Crown, Heart, Home, LogOut, Rss, Settings, ShieldCheck, Sparkles, Users, Wrench, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isWrappedSeason } from '@/lib/wrappedSeason'
import { tierPreviewEnabled } from '@/app/hooks/useTierPreview'
import { isStaffRole } from '@/lib/roles'
interface UserMenuProps {

}

interface NavItem { href: string; label: string; icon: LucideIcon; inHeader?: boolean }

// The everyday places first, the occasional ones after a divider.
const PRIMARY: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/feed", label: "Feed", icon: Rss },
  { href: "/discover", label: "Discover", icon: Compass, inHeader: true },
  { href: "/circles", label: "Reading circles", icon: Users, inHeader: true },
]
const SECONDARY: NavItem[] = [
  { href: "/favourites", label: "Favourites", icon: Heart },
  { href: "/stats", label: "Stats", icon: BarChart3, inHeader: true },
  { href: "/plus", label: "Bookmark Plus", icon: Crown },
]

const UserMenu: FC<UserMenuProps> = ({}) => {
  const pathname = usePathname()
  const [showMenu, setShowMenu] = useState(false)
  const close = () => setShowMenu(false)

  const {user, isLoading} = useUser()
  const booksReadFor = useBooksReadFor()
  // From 1 December, in the reader's own calendar. Set after mount, so the server's clock (UTC) never disagrees with the browser's at hydration.
  const [wrappedYear, setWrappedYear] = useState<number | null>(null)
  useEffect(() => {
    if (isWrappedSeason()) setWrappedYear(new Date().getFullYear())
  }, [])
  // Below md the menu covers the screen, so freeze the page behind it; otherwise a swipe scrolls the page instead of the menu.
  useEffect(() => {
    if (!showMenu || !window.matchMedia('(max-width: 767px)').matches) return
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [showMenu])
  useEffect(() => {
    if (!showMenu) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMenu(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showMenu])
  if (user) {
    const booksRead = booksReadFor(user.username, booksReadOf(user))
    const { tier, next, remaining, progress } = tierProgress(booksRead)
    const barTier = next ?? tier
    const secondary: NavItem[] = wrappedYear
      ? [...SECONDARY, { href: `/wrapped/${wrappedYear}`, label: `Your ${wrappedYear} Wrapped`, icon: Sparkles }]
      : SECONDARY

    const avatar = (className?: string) => (
      <Avatar className={className} style={{background: avatarColour(user?.favColour), ...tierRingStyle(booksRead)}}>
        {user?.image && <AvatarImage src={user.image} alt='' />}
        {/* Also covers a photo that fails to load. */}
        <AvatarFallback className='bg-transparent'><InitialAvatar username={user?.username} favColour={user?.favColour} label='' /></AvatarFallback>
      </Avatar>
    )

    // Links already in the header bar are left out of the dropdown once the bar shows them.
    const navLink = ({ href, label, icon: Icon, inHeader }: NavItem) => {
      // Home redirects to your own profile, so that's where it counts as active.
      const active = href === "/" ? pathname === `/u/${user.username}` : pathname?.startsWith(href)
      return (
        <Link key={href} href={href} onClick={close} aria-current={active ? "page" : undefined}
          className={cn("flex items-center gap-3 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm font-medium transition hover:bg-neutral-100 dark:hover:bg-neutral-800",
            active && "bg-neutral-100 dark:bg-neutral-800", inHeader && "sm:hidden")}>
          <Icon size={18} className="text-muted-foreground shrink-0" aria-hidden />
          {label}
        </Link>
      )
    }

    return (
      <>
        <div className="flex gap-2 relative items-center">
            {wrappedYear && (
              <Link href={`/wrapped/${wrappedYear}`} className="hidden sm:inline-flex h-9 items-center px-3 rounded-full text-sm font-semibold text-white bg-brand-fill hover:bg-brand-fill-hover transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Your {wrappedYear} Wrapped
              </Link>
            )}
            <NotificationBell/>

        <button type="button" aria-label="Open menu" aria-expanded={showMenu} onClick={()=>setShowMenu((state)=>!state)}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
          {avatar()}
        </button>
        {showMenu && <>
          {/* Catches clicks outside the dropdown on wider screens. */}
          <div onClick={close} className="fixed inset-0 z-40" aria-hidden />
          <nav aria-label="Account menu" className="fixed inset-0 z-50 flex flex-col h-[100dvh] bg-background overflow-y-auto overscroll-contain md:overflow-visible md:absolute md:inset-auto md:right-0 md:top-12 md:h-auto md:w-72 md:rounded-xl md:shadow-lg md:ring-1 md:ring-neutral-200 md:dark:ring-neutral-800 md:pb-1">
            <div className="flex items-center gap-3 px-4 pt-5 pb-4 md:pt-4">
              {avatar("h-11 w-11 md:h-9 md:w-9")}
              <p className="min-w-0 flex-1 font-semibold truncate">{user.username}</p>
              <button type="button" aria-label="Close menu" onClick={close} className="p-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition rounded-full md:hidden">
                <X size={20} aria-hidden />
              </button>
            </div>

            <Link href="/achievements" onClick={close} className="group mx-4 mb-2 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-900">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{tier ? `${tier.label} reader` : "Reading tier"}</p>
                <ChevronRight size={16} className="text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
              </div>
              {barTier && (
                <div className="mt-2 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(progress * 100, 4)}%`, background: `linear-gradient(90deg, ${barTier.colour}, ${barTier.shade})` }} />
                </div>
              )}
              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                {next ? `${remaining} more ${remaining === 1 ? "book" : "books"} to ${next.label}` : "You've reached the top tier"}
              </p>
            </Link>

            <div className="flex flex-col px-2 py-2">{PRIMARY.map(navLink)}</div>
            <hr className="mx-4 border-neutral-200 dark:border-neutral-800" />
            <div className="flex flex-col px-2 py-2">{secondary.map(navLink)}</div>
            <div className="mx-2 mt-auto md:mt-0 border-t border-neutral-200 dark:border-neutral-800 py-2">
              {navLink({ href: "/settings", label: "Settings", icon: Settings })}
              {isStaffRole(user) && navLink({ href: "/staff", label: "Staff", icon: ShieldCheck })}
              {tierPreviewEnabled && navLink({ href: "/dev/tiers", label: "Dev tools", icon: Wrench })}
              {/* Straight to the landing page: no confirmation screen. */}
              <button type="button" onClick={() => { close(); void signOut({ callbackUrl: '/' }) }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm font-medium text-muted-foreground transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-foreground">
                <LogOut size={18} className="shrink-0" aria-hidden />
                Sign out
              </button>
            </div>
          </nav>
        </>}
        </div>
      </>
    )
    }
  // Until we know who's here, show nothing: a signed-in reader shouldn't see Sign in flash past.
  if (isLoading) return <div className="h-9" aria-hidden />
  // Sign in reads like the page links beside it, so Sign up is the one thing in the row that stands out.
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <Link href="/signin" className="inline-flex h-9 items-center px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Sign in
      </Link>
      <Link href="/register" className="inline-flex h-9 items-center px-4 rounded-md text-sm font-semibold text-white bg-brand-fill hover:bg-brand-fill-hover transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Sign up
      </Link>
    </div>
  )
}

export default UserMenu
