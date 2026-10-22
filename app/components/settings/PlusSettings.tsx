"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import moment from 'moment'
import { Check, Copy, Gift, Loader2, Sparkles } from 'lucide-react'
import useSWR from 'swr'
import { fetcher, swrOptions } from '@/lib/fetcher'
import { cn } from '@/lib/utils'
import { REFERRALS, planStatusOf } from '@/lib/entitlements'
import useUser from '@/app/hooks/useUser'
import useBilling from '@/app/hooks/useBilling'
import { Button } from '../ui/button'

// Bookmark Plus in settings: the plan, the way to manage it in Stripe's portal, and invite rewards.
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
      : status.source === "comp" && status.compUntil
        ? `Free Plus until ${moment(status.compUntil).format("D MMMM YYYY")}, from inviting friends or a gift.`
        : "You're on the free plan. Every stat, import and circle you join stays free."
  const label = status.source === "lifetime" ? "Lifetime" : status.patron ? "Patron" : status.trialing ? "Trial" : status.source === "comp" ? "Free months" : status.plan === "PLUS" ? "Active" : "Free"

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles size={14} aria-hidden className="text-brand" /> Bookmark Plus
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
          {status.source !== "subscription" && status.source !== "lifetime" && (
            <Button asChild className="bg-brand-fill hover:bg-brand-fill-hover text-white">
              <Link href="/plus">{status.trialUsed ? "See Plus" : "Try Plus free"}</Link>
            </Button>
          )}
        </div>
      </div>
      <PlusRewards />
    </div>
  )
}

export default PlusSettings

type Rewards = {
  invitePath: string | null
  referrals: { joined: number; qualified: number; rewardedThisYear: number; perYear: number }
  giftCodes: { code: string; redeemed: boolean }[]
}

// Copies to the clipboard, falling back to selecting the text where the browser refuses.
const CopyField: FC<{ id: string; label: string; value: string }> = ({ id, label, value }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      (document.getElementById(id) as HTMLInputElement | null)?.select()
    }
  }
  return (
    <div className="flex gap-2">
      <input id={id} aria-label={label} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs" />
      <Button type="button" variant="outline" onClick={copy} className="h-9 shrink-0 gap-1.5 px-3 text-xs">
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}

// Your invite link and what it has earned, and the gift codes a lifetime buyer has to hand out.
const PlusRewards: FC = () => {
  const { data } = useSWR<Rewards>("/api/plus/rewards", fetcher, swrOptions)
  if (!data?.invitePath) return null
  const link = typeof window === "undefined" ? data.invitePath : new URL(data.invitePath, window.location.origin).toString()
  const { referrals, giftCodes } = data
  const left = Math.max(0, referrals.perYear - referrals.rewardedThisYear)

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Invite friends, get Plus</span>
        <p className="-mt-1 text-xs text-muted-foreground">
          A free month of Plus for each friend who joins with your link (or through a circle you host) and logs some reading. Up to {REFERRALS.perYear} a year.
          {referrals.joined > 0 ? ` ${referrals.joined} joined so far, ${referrals.qualified} reading. ${left} free ${left === 1 ? "month" : "months"} left to earn this year.` : ""}
        </p>
        <CopyField id="plus-invite-link" label="Your invite link" value={link} />
      </div>
      {giftCodes.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium"><Gift size={14} aria-hidden className="text-brand" /> Gift codes</span>
          <p className="-mt-1 text-xs text-muted-foreground">A month of Plus each, for friends who haven&apos;t had it. They enter the code on the Plus page.</p>
          <ul className="flex flex-col gap-1.5">
            {giftCodes.map((g) => (
              <li key={g.code} className="flex items-center justify-between gap-3 text-sm">
                <code className={cn("font-mono tracking-wider", g.redeemed && "text-muted-foreground line-through")}>{g.code}</code>
                <span className="text-xs text-muted-foreground">{g.redeemed ? "Used" : "Ready to give"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
