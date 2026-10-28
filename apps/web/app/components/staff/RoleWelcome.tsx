"use client"
import { FC, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import confetti from 'canvas-confetti'
import { Check } from 'lucide-react'
import useUser from '@/app/hooks/useUser'
import { ROLE_WELCOME, roleToWelcome, type StaffRole } from '@/lib/roleWelcome'
import Modal from '../modals/Modal'
import { primaryButtonClass, secondaryButtonClass } from '../profile-head/ProfileHeader'
import StaffSeal from '../profile-head/StaffSeal'
import type { StaffBadgeKind } from '@/lib/staffBadge'

// Each role's emblem, in the place a medal sits: the staff seal they'll now wear (lib/staffBadge.ts), with
// the seal's colour in the confetti. tick: the checklist's colour, deeper than the librarian's yellow so it
// still shows on a light page.
const EMBLEM: Record<StaffRole, { seal: StaffBadgeKind; light: string; colour: string; tick: string }> = {
  LIBRARIAN: { seal: 'librarian', light: '#FBE39A', colour: '#F2C230', tick: '#B8860B' },
  ADMIN: { seal: 'team', light: '#FF9A8F', colour: '#F13C3C', tick: '#F13C3C' },
}

// The same burst as a medal (achievements/EarnCelebration.tsx), in the emblem's colours. canvas-confetti
// skips it when the reader asks for reduced motion.
function burst(colours: string[]) {
  const shared = { disableForReducedMotion: true, colors: [...colours, '#FBF1DF'], zIndex: 1000, ticks: 220 }
  confetti({ ...shared, particleCount: 90, spread: 75, startVelocity: 42, origin: { x: 0.5, y: 0.35 } })
  setTimeout(() => confetti({ ...shared, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.6 } }), 150)
  setTimeout(() => confetti({ ...shared, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.6 } }), 150)
}

// The welcome to a new librarian or admin role: what it is and what it lets them do. Opens once per role,
// the first time the app loads after an admin sets it (lib/roleWelcome.ts). Mounted in the (main) layout.
const RoleWelcome: FC = () => {
  const { user, mutate } = useUser()
  const role = roleToWelcome(user)
  const burstFor = useRef<StaffRole | null>(null)
  // Modal closes itself on a page change, and signing in lands on one page and redirects to another,
  // which would mark the welcome seen before anyone read it. So a close from Modal while the path has just
  // changed is ignored and the welcome stays up on the new page. Modal's effect runs before this one, so
  // shownOn still holds the old path when it calls onClose.
  const pathname = usePathname()
  const currentPath = useRef(pathname)
  currentPath.current = pathname
  const shownOn = useRef(pathname)
  useEffect(() => { shownOn.current = pathname }, [pathname])

  useEffect(() => {
    if (!role || burstFor.current === role) return
    burstFor.current = role
    const e = EMBLEM[role]
    burst([e.light, e.colour])
  }, [role])

  if (!role) return null
  const welcome = ROLE_WELCOME[role]
  const emblem = EMBLEM[role]

  // Closed straight away; the server records the role it holds, so a failed save just shows it again next time.
  const close = () => {
    mutate({ ...user, roleWelcomedAs: role }, { revalidate: false })
    fetch('/api/user/role-welcome', { method: 'POST' }).catch(() => {})
  }
  const closeFromModal = () => {
    if (currentPath.current === shownOn.current) close()
  }

  const body = (
    <div className="flex w-full flex-col items-center px-6 pb-6 text-center">
      <StaffSeal kind={emblem.seal} size={80} shine pressable={false} className="mb-5" />
      <p className="text-2xl font-bold">{welcome.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{welcome.lede}</p>

      <div className="mt-6 w-full text-left">
        <p id="role-duties" className="text-xs font-medium text-muted-foreground">What you can do now</p>
        <ul className="mt-2 flex flex-col gap-2" aria-labelledby="role-duties">
          {welcome.duties.map((duty) => (
            <li key={duty} className="flex items-start gap-2.5 text-sm">
              <Check size={16} aria-hidden className="mt-0.5 shrink-0" style={{ color: emblem.tick }} />
              <span>{duty}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 rounded-xl bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">{welcome.badge}</p>

      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/staff" onClick={close} className={primaryButtonClass}>Open the staff console</Link>
        <button type="button" onClick={close} className={secondaryButtonClass}>Got it</button>
      </div>
    </div>
  )

  return <Modal isOpen onClose={closeFromModal}title={welcome.heading} body={body} compact size="sm" />
}

export default RoleWelcome
