"use client"
import { FC } from 'react'
import Link from 'next/link'
import moment from 'moment'
import { Loader2, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isIndefiniteComp, planStatusOf } from '@/lib/entitlements'
import useUser from '@/app/hooks/useUser'
import useBilling from '@/app/hooks/useBilling'
import { Button } from '../ui/button'

// Bookmark Plus in settings: the plan, and the way to manage it in Stripe's portal.
// The looks Plus unlocks (profile theme, shelf colour) live in Edit profile (profile/ProfileStyling).
const PlusSettings: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { user } = useUser()
  const billing = useBilling()
  if (!user) return null

  const status = planStatusOf(user)
  const busy = disabled || billing.pending !== null

  const summary = status.source === "lifetime" ? "Lifetime Plus. Thank you for backing Bookmark from the start."
    : status.source === "subscription"
      ? status.trialing
        ? `On your free trial until ${moment(status.until).format("D MMMM")}. Add a card in the portal to keep Plus after that.`
        : status.until ? `Renews or ends on ${moment(status.until).format("D MMMM YYYY")}.` : "Thanks for supporting Bookmark."
      : status.source === "store"
        ? `Plus through ${status.store === "PLAY_STORE" ? "Google Play" : "the App Store"}${status.until ? `, renewing or ending on ${moment(status.until).format("D MMMM YYYY")}` : ""}. Manage or cancel it in ${status.store === "PLAY_STORE" ? "the Play Store app" : "your iPhone's Settings"}.`
      : status.source === "comp" && status.compUntil
        ? isIndefiniteComp(status.compUntil) ? "Complimentary Plus from the Bookmark team, with no end date." : `Free Plus until ${moment(status.compUntil).format("D MMMM YYYY")}.`
        : "You're on the free plan. Every stat, import and circle you join stays free."
  const label = status.source === "lifetime" ? "Lifetime" : status.patron ? "Patron" : status.trialing ? "Trial" : status.source === "comp" ? (isIndefiniteComp(status.compUntil) ? "Complimentary" : "Free months") : status.plan === "PLUS" ? "Active" : "Free"

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Crown size={14} aria-hidden className="text-brand" /> Bookmark Plus
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              status.plan === "PLUS" ? "bg-brand/10 text-brand-fill dark:text-brand" : "bg-neutral-100 dark:bg-neutral-900 text-muted-foreground"
            )}>
              {label}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status.hasBilling && (
            <Button type="button" variant="outline" disabled={busy} onClick={billing.openPortal} className="gap-2">
              {billing.pending === "portal" && <Loader2 size={15} className="animate-spin" aria-hidden />}
              Manage subscription
            </Button>
          )}
          {status.source !== "subscription" && status.source !== "store" && status.source !== "lifetime" && (
            <Button asChild className="bg-brand-fill hover:bg-brand-fill-hover text-white">
              <Link href="/plus">{status.trialUsed ? "See Plus" : "Try Plus free"}</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlusSettings
