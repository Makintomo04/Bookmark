"use client"
import { FC, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import moment from 'moment'
import { Check, Crown, Gift, Infinity as InfinityIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FOUNDING, PLUS_PRICING, type PlanStatus } from '@/lib/entitlements'
import { FREE, FREE_SOON, PLUS, PLUS_SOON } from '@bookmark/shared/plusFeatures'
import { formatPrice, type PlusCurrency, type PricedPlan } from '@/lib/regionalPricing'
import useBilling from '@/app/hooks/useBilling'

// The free and Plus columns (packages/shared/src/plusFeatures.ts): every claim has to match something the app does.
const CURRENCY_NAME: Record<PlusCurrency, string> = { USD: 'US dollars', GBP: 'pounds', EUR: 'euros' }

const cardClassName = 'rounded-[20px] border border-neutral-200 dark:border-neutral-800'
const mutedClassName = 'text-neutral-600 dark:text-neutral-300/90'
const ctaClassName = 'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-6 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
const fmtCount = (n: number) => n.toLocaleString('en-US')

const Feature: FC<{ children: string; soon?: boolean; strong?: boolean }> = ({ children, soon, strong }) => (
  <li className="flex items-start gap-2.5 text-sm">
    <Check size={16} aria-hidden className={cn('mt-0.5 shrink-0', soon ? 'text-muted-foreground' : 'text-brand')} />
    <span className={cn(strong && 'font-semibold', soon && 'text-muted-foreground')}>
      {children}
      {soon && <span className="ml-2 rounded-full bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 text-[11px] font-medium">Coming soon</span>}
    </span>
  </li>
)

type Window = { open: boolean; remaining: number; closesAt: string | null }

interface PlusPricingProps {
  signedIn: boolean
  status: (Omit<PlanStatus, 'until' | 'compUntil'> & { until: string | null; compUntil: string | null }) | null
  checkout: 'success' | 'cancelled' | null
  // The visitor's currency and its prices (lib/regionalPricing.ts). Checkout charges the same amounts.
  currency: PlusCurrency
  prices: Record<PricedPlan, number>
  // The Founding window, from the server. Checkout decides again when the reader clicks.
  founding: Window
}

const PlusPricing: FC<PlusPricingProps> = ({ signedIn, status, checkout, currency, prices, founding }) => {
  const router = useRouter()
  const billing = useBilling()
  const [interval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly')
  const source = status?.source ?? null
  const subscribed = source === 'subscription' || source === 'store' || source === 'lifetime'
  const trial = !status?.trialUsed
  const money = (amount: number) => formatPrice(currency, amount)

  // Back from Checkout before Stripe's webhook has landed: look again a few times.
  const [waited, setWaited] = useState(0)
  const waiting = checkout === 'success' && !subscribed && waited < 6
  useEffect(() => {
    if (!waiting) return
    const timer = window.setTimeout(() => { setWaited((n) => n + 1); router.refresh() }, 2500)
    return () => window.clearTimeout(timer)
  }, [waiting, waited, router])

  // What the button buys. Yearly gets the Founding price while it's open.
  const choice = interval
  const foundingOffer = choice === 'yearly' && founding.open && !subscribed
  const price = choice === 'monthly' ? prices.monthly : foundingOffer ? prices.founding : prices.yearly
  const per = interval === 'yearly' ? 'year' : 'month'
  const yearlySaving = Math.round((1 - prices.yearly / (prices.monthly * 12)) * 100)

  let cta
  if (!signedIn) {
    cta = <Link href="/register?callbackUrl=/plus" className={cn(ctaClassName, 'bg-brand-fill text-white hover:bg-brand-fill-hover')}>Sign up and try Plus free</Link>
  } else if (subscribed) {
    cta = source === 'lifetime' ? (
      <p className={cn(ctaClassName, 'border border-neutral-300 dark:border-neutral-700')}><InfinityIcon size={18} aria-hidden />You have lifetime Plus</p>
    ) : (
      <button type="button" onClick={billing.openPortal} disabled={billing.pending !== null} className={cn(ctaClassName, 'border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900')}>
        {billing.pending === 'portal' && <Loader2 size={18} className="animate-spin" aria-hidden />}Manage subscription
      </button>
    )
  } else {
    cta = (
      <button type="button" onClick={() => billing.startCheckout(choice)} disabled={billing.pending !== null} className={cn(ctaClassName, 'bg-brand-fill text-white hover:bg-brand-fill-hover')}>
        {billing.pending === 'checkout' && <Loader2 size={18} className="animate-spin" aria-hidden />}
        {trial ? `Start your ${PLUS_PRICING.trialDays}-day free trial` : `Get Plus for ${money(price)} a ${per}`}
      </button>
    )
  }

  const badge = status?.patron ? 'Patron' : source === 'lifetime' ? 'Lifetime' : status?.founding && source === 'subscription' ? 'Founding Reader'
    : status?.trialing ? 'On trial' : source === 'comp' ? 'Free months' : source ? 'Your plan' : null

  return (
    <div className="flex flex-col gap-10 pb-8">
      <header className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand-fill dark:text-brand">
          <Crown size={14} aria-hidden /> Bookmark Plus
        </span>
        <h1 className="display-hero mt-4">All your stats are free.</h1>
        <p className={cn('mt-4 text-base md:text-lg', mutedClassName)}>
          Plus lets you host more circles, set extra goals and use Ask the shelf and Catch me up more often. It never gates your stats, your import, or the circles your friends invite you to.
        </p>
      </header>

      {checkout === 'success' && (
        <p role="status" className="mx-auto flex max-w-xl items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {subscribed ? <Check size={16} aria-hidden /> : waiting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
          {subscribed ? 'Welcome to Plus. Thanks for supporting Bookmark.' : waiting ? 'Setting up your Plus account…' : 'Stripe has your order. Plus can take a minute to switch on; refresh the page if it hasn’t.'}
        </p>
      )}
      {checkout === 'cancelled' && !subscribed && (
        <p role="status" className="mx-auto max-w-xl rounded-xl bg-neutral-100 dark:bg-neutral-900 px-4 py-3 text-center text-sm">
          No charge, nothing changed. Plus is here whenever you want it.
        </p>
      )}
      {source === 'comp' && status?.compUntil && (
        <p role="status" className="mx-auto flex max-w-xl items-center gap-2 rounded-xl bg-brand/10 px-4 py-3 text-sm">
          <Gift size={16} aria-hidden className="shrink-0 text-brand" />
          You have free Plus until {moment(status.compUntil).format('D MMMM YYYY')}. Subscribe any time to keep it after that.
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
          <p className="mt-3 flex items-baseline gap-1.5"><span className="text-4xl font-bold tracking-tight">{formatPrice(currency, 0)}</span><span className={mutedClassName}>forever</span></p>
          <p className={cn('mt-2 text-sm', mutedClassName)}>The best free tracker we can make. No ads, no Amazon.</p>
          <ul className="mt-6 flex flex-col gap-3">
            {FREE.map((f) => <Feature key={f}>{f}</Feature>)}
            {FREE_SOON.map((f) => <Feature key={f} soon>{f}</Feature>)}
          </ul>
          {signedIn && !source && <p className="mt-auto pt-8 text-center text-sm font-medium text-muted-foreground">Your current plan</p>}
        </section>

        <section aria-labelledby="plus-heading" className="relative flex flex-col rounded-[20px] border-2 border-brand/60 p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 id="plus-heading" className="flex items-center gap-2 text-lg font-bold"><Crown size={18} aria-hidden className="text-brand" /> Plus</h2>
            {badge && <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand-fill dark:text-brand">{badge}</span>}
          </div>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-4xl font-bold tracking-tight tabular-nums">{money(price)}</span>
            {foundingOffer && <s className={cn('text-lg tabular-nums', mutedClassName)} aria-label={`usually ${money(prices.yearly)}`}>{money(prices.yearly)}</s>}
            <span className={mutedClassName}>a {per}</span>
          </p>
          {foundingOffer ? (
            <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-sm text-foreground">
              <span className="font-semibold">Founding Reader price.</span> Yours for as long as you stay subscribed.{' '}
              <span className="tabular-nums">{fmtCount(founding.remaining)} of {fmtCount(FOUNDING.cap)} left</span>
              {founding.closesAt ? `, until ${moment(founding.closesAt).format('D MMMM')}` : ''}.
            </p>
          ) : (
            <p className={cn('mt-2 text-sm', mutedClassName)}>
              {interval === 'yearly' ? `That's about ${money(Math.round((prices.yearly / 12) * 100) / 100)} a month, billed once a year.` : 'Billed monthly. Cancel any time.'}
            </p>
          )}
          <ul className="mt-6 flex flex-col gap-3">
            {PLUS.map((f, i) => <Feature key={f} strong={i === 0}>{f}</Feature>)}
            {PLUS_SOON.map((f) => <Feature key={f} soon>{f}</Feature>)}
          </ul>
          <div className="mt-auto pt-8">
            {cta}
            <p className={cn('mt-3 text-center text-xs', mutedClassName)}>
              {source === 'lifetime' ? 'Thank you for backing Bookmark from the start.'
                : source === 'store' ? `You subscribed in the app. Manage it in ${status?.store === 'PLAY_STORE' ? 'Google Play' : 'the App Store'}.`
                : source === 'subscription'
                  ? status?.until ? `${status.trialing ? 'Trial ends' : 'Renews or ends'} ${moment(status.until).format('D MMMM YYYY')}.` : 'Change or cancel any time in the portal.'
                  : trial
                    ? `${PLUS_PRICING.trialDays} days free, no card needed. If you don't add one, the trial just ends and you're back on Free.`
                    : 'Cancel any time from your settings.'}
            </p>
          </div>
        </section>
      </div>

      <p className={cn('mx-auto max-w-2xl text-center text-sm', mutedClassName)}>
        Prices are in {CURRENCY_NAME[currency]} and include any VAT or sales tax. Payments are handled by Stripe; Bookmark never sees your card. Cancel from your settings and Plus stays until the end of the period you paid for.
      </p>
    </div>
  )
}

export default PlusPricing
