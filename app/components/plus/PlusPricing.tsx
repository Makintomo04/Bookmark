"use client"
import { FC, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import moment from 'moment'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLUS_PRICING, type PlanStatus } from '@/lib/entitlements'
import type { BillingInterval } from '@/lib/stripe'
import useBilling from '@/app/hooks/useBilling'

// The free and Plus columns, from the strategy's table. Features that haven't shipped yet say so:
// every claim on this page has to match something the app does.
const FREE = [
  'Import from Goodreads and StoryGraph',
  'Every personal stat, your Wrapped and a yearly goal',
  'Join any circle: every comment, reply and reaction',
  'Host one active reading circle at a time',
  'Reviews, notes, lists, feed, follows and privacy controls',
  'DNF, paused, re-reads, half stars, quests and medals',
  'Export all your data, always',
]
const FREE_SOON = ['Ask the shelf: 5 mood searches a month', 'Catch me up: 3 recaps a month']

const PLUS = [
  'Everything in Free',
  'Host as many active circles as you like',
  'A page goal and a monthly pace beside your yearly goal',
  'Monthly Wrap cards to share any month',
  'Profile themes and your own shelf card colour',
  'A supporter badge on your profile',
]
const PLUS_SOON = ['Unlimited Ask the shelf searches', 'Unlimited Catch me up recaps']

const cardClassName = 'rounded-[20px] border border-neutral-200 dark:border-neutral-800'
const mutedClassName = 'text-slate-600 dark:text-gray-300/90'
const ctaClassName = 'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-6 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-60'

const yearlySaving = Math.round((1 - PLUS_PRICING.yearly / (PLUS_PRICING.monthly * 12)) * 100)

const Feature: FC<{ children: string; soon?: boolean; strong?: boolean }> = ({ children, soon, strong }) => (
  <li className="flex items-start gap-2.5 text-sm">
    <Check size={16} aria-hidden className={cn('mt-0.5 shrink-0', soon ? 'text-muted-foreground' : 'text-brand')} />
    <span className={cn(strong && 'font-semibold', soon && 'text-muted-foreground')}>
      {children}
      {soon && <span className="ml-2 rounded-full bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 text-[11px] font-medium">Coming soon</span>}
    </span>
  </li>
)

interface PlusPricingProps {
  signedIn: boolean
  status: (Omit<PlanStatus, 'until'> & { until: string | null }) | null
  checkout: 'success' | 'cancelled' | null
}

const PlusPricing: FC<PlusPricingProps> = ({ signedIn, status, checkout }) => {
  const router = useRouter()
  const billing = useBilling()
  const [interval, setBillingInterval] = useState<BillingInterval>('yearly')
  const isPlus = status?.plan === 'PLUS'
  const trial = !status?.trialUsed

  // Back from Checkout before Stripe's webhook has landed: look again a few times.
  const [waited, setWaited] = useState(0)
  const waiting = checkout === 'success' && !isPlus && waited < 6
  useEffect(() => {
    if (!waiting) return
    const timer = window.setTimeout(() => { setWaited((n) => n + 1); router.refresh() }, 2500)
    return () => window.clearTimeout(timer)
  }, [waiting, waited, router])

  const price = interval === 'yearly' ? PLUS_PRICING.yearly : PLUS_PRICING.monthly
  const per = interval === 'yearly' ? 'year' : 'month'

  let cta
  if (!signedIn) {
    cta = <Link href="/register?callbackUrl=/plus" className={cn(ctaClassName, 'bg-brand-fill text-white hover:bg-brand-fill-hover')}>Sign up and try Plus free</Link>
  } else if (isPlus) {
    cta = (
      <button type="button" onClick={billing.openPortal} disabled={billing.pending !== null} className={cn(ctaClassName, 'border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900')}>
        {billing.pending === 'portal' && <Loader2 size={18} className="animate-spin" aria-hidden />}Manage subscription
      </button>
    )
  } else {
    cta = (
      <button type="button" onClick={() => billing.startCheckout(interval)} disabled={billing.pending !== null} className={cn(ctaClassName, 'bg-brand-fill text-white hover:bg-brand-fill-hover')}>
        {billing.pending === 'checkout' && <Loader2 size={18} className="animate-spin" aria-hidden />}
        {trial ? `Start your ${PLUS_PRICING.trialDays}-day free trial` : `Get Plus for $${price} a ${per}`}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-10 pb-8">
      <header className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand-fill dark:text-brand">
          <Sparkles size={14} aria-hidden /> Bookmark Plus
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">All your stats are free.</h1>
        <p className={cn('mt-4 text-base md:text-lg', mutedClassName)}>
          Plus adds recaps, hosting tools and personalisation. It never gates your stats, your import, or the circles your friends invite you to.
        </p>
      </header>

      {checkout === 'success' && (
        <p role="status" className="mx-auto flex max-w-xl items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {isPlus ? <Check size={16} aria-hidden /> : waiting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
          {isPlus ? 'Welcome to Plus. Thanks for supporting Bookmark.' : waiting ? 'Setting up your Plus account…' : 'Stripe has your order. Plus can take a minute to switch on; refresh the page if it hasn’t.'}
        </p>
      )}
      {checkout === 'cancelled' && !isPlus && (
        <p role="status" className="mx-auto max-w-xl rounded-xl bg-neutral-100 dark:bg-neutral-900 px-4 py-3 text-center text-sm">
          No charge, nothing changed. Plus is here whenever you want it.
        </p>
      )}

      <div role="radiogroup" aria-label="Billing period" className="mx-auto inline-flex rounded-full bg-neutral-100 dark:bg-neutral-900 p-1">
        {(['monthly', 'yearly'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={interval === value}
            onClick={() => setBillingInterval(value)}
            className={cn(
              'h-9 rounded-full px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              interval === value ? 'bg-background dark:bg-neutral-700 shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {value === 'monthly' ? 'Monthly' : <>Yearly <span className="ml-1 text-xs font-semibold text-brand-fill dark:text-brand">save {yearlySaving}%</span></>}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="free-heading" className={cn('flex flex-col p-6 sm:p-8', cardClassName)}>
          <h2 id="free-heading" className="text-lg font-bold">Free</h2>
          <p className="mt-3 flex items-baseline gap-1.5"><span className="text-4xl font-bold tracking-tight">$0</span><span className={mutedClassName}>forever</span></p>
          <p className={cn('mt-2 text-sm', mutedClassName)}>The best free tracker we can make. No ads, no Amazon.</p>
          <ul className="mt-6 flex flex-col gap-3">
            {FREE.map((f) => <Feature key={f}>{f}</Feature>)}
            {FREE_SOON.map((f) => <Feature key={f} soon>{f}</Feature>)}
          </ul>
          {signedIn && !isPlus && <p className="mt-auto pt-8 text-center text-sm font-medium text-muted-foreground">Your current plan</p>}
        </section>

        <section aria-labelledby="plus-heading" className="relative flex flex-col rounded-[20px] border-2 border-brand/60 p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 id="plus-heading" className="flex items-center gap-2 text-lg font-bold"><Sparkles size={18} aria-hidden className="text-brand" /> Plus</h2>
            {isPlus && <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand-fill dark:text-brand">{status?.trialing ? 'On trial' : 'Your plan'}</span>}
          </div>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="text-4xl font-bold tracking-tight tabular-nums">${price}</span>
            <span className={mutedClassName}>a {per}</span>
          </p>
          <p className={cn('mt-2 text-sm', mutedClassName)}>
            {interval === 'yearly' ? `That's about $${(PLUS_PRICING.yearly / 12).toFixed(2)} a month, billed once a year.` : 'Billed monthly. Cancel any time.'}
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {PLUS.map((f, i) => <Feature key={f} strong={i === 0}>{f}</Feature>)}
            {PLUS_SOON.map((f) => <Feature key={f} soon>{f}</Feature>)}
          </ul>
          <div className="mt-auto pt-8">
            {cta}
            <p className={cn('mt-3 text-center text-xs', mutedClassName)}>
              {isPlus
                ? status?.until ? `${status.trialing ? 'Trial ends' : 'Renews or ends'} ${moment(status.until).format('D MMMM YYYY')}.` : 'Change or cancel any time in the portal.'
                : trial
                  ? `${PLUS_PRICING.trialDays} days free, no card needed. If you don't add one, the trial just ends and you're back on Free.`
                  : 'Cancel any time from your settings.'}
            </p>
          </div>
        </section>
      </div>

      <p className={cn('mx-auto max-w-2xl text-center text-sm', mutedClassName)}>
        Prices are in US dollars and include any VAT or sales tax. Payments are handled by Stripe; Bookmark never sees your card. Cancel from your settings and Plus stays until the end of the period you paid for.
      </p>
    </div>
  )
}

export default PlusPricing
