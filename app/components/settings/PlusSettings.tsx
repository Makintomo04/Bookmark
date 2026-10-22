"use client"
import { FC, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import moment from 'moment'
import { Loader2, Sparkles } from 'lucide-react'
import type { ProfileTheme } from '@prisma/client'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { DEFAULT_COLOUR } from '@/lib/profile'
import { toHex } from '@/lib/colour'
import { entitlementsOf, isUpgradeRequired, planStatusOf } from '@/lib/entitlements'
import { PROFILE_THEMES, type PersonalisationInput } from '@/lib/personalisation'
import useUser from '@/app/hooks/useUser'
import useBilling from '@/app/hooks/useBilling'
import { Button } from '../ui/button'
import ColourSwatches from '../profile/ColourSwatches'
import UpgradePrompt from '../plus/UpgradePrompt'
import { Segmented } from './controls'

const THEME_OPTIONS = PROFILE_THEMES.map((t) => ({ value: t.id, label: t.name }))

// Bookmark Plus in settings: the plan, the way to manage it in Stripe's portal, and the
// personalisation it unlocks. Each personalisation control saves on change; the server
// refuses (402) a free account, so the controls here are a convenience, not the gate.
const PlusSettings: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { user, mutate } = useUser()
  const billing = useBilling()
  const [saving, setSaving] = useState<keyof PersonalisationInput | null>(null)
  if (!user) return null

  const status = planStatusOf(user)
  const { personalisation: canPersonalise } = entitlementsOf(user)
  const busy = disabled || saving !== null || billing.pending !== null
  const theme: ProfileTheme = canPersonalise && user.profileTheme ? user.profileTheme : "CLASSIC"
  const shelfColour = toHex(user.shelfCardColour ?? "")

  const save = (patch: PersonalisationInput) => {
    const key = Object.keys(patch)[0] as keyof PersonalisationInput
    setSaving(key)
    mutate({ ...user, ...patch }, { revalidate: false })
    axios.patch("/api/user/personalisation", patch)
      .then((res) => mutate({ ...user, ...res.data }, { revalidate: false }))
      .catch((err) => {
        mutate(user, { revalidate: false })
        if (isUpgradeRequired(err?.response?.data)) notify.error("Profile themes and shelf colours are part of Plus.")
        else notify.error("Couldn't save that setting.", { retry: () => save(patch) })
      })
      .finally(() => setSaving(null))
  }

  const summary = status.plan === "PLUS"
    ? status.trialing
      ? `On your free trial until ${moment(status.until).format("D MMMM")}. Add a card in the portal to keep Plus after that.`
      : status.until ? `Renews or ends on ${moment(status.until).format("D MMMM YYYY")}.` : "Thanks for supporting Bookmark."
    : "You're on the free plan. Every stat, import and circle you join stays free."

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
              {status.plan === "PLUS" ? (status.trialing ? "Trial" : "Active") : "Free"}
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
          {status.plan !== "PLUS" && (
            <Button asChild className="bg-brand-fill hover:bg-brand-fill-hover text-white">
              <Link href="/plus">{status.trialUsed ? "See Plus" : "Try Plus free"}</Link>
            </Button>
          )}
        </div>
      </div>

      <div className={cn("flex flex-col gap-5", !canPersonalise && "opacity-60")}>
        <div className="flex flex-col gap-1.5">
          <Segmented id="plus-theme" label="Profile theme" options={THEME_OPTIONS} value={theme} onChange={(v) => save({ profileTheme: v })} disabled={busy || !canPersonalise} />
          <p className="text-xs text-muted-foreground">{PROFILE_THEMES.find((t) => t.id === theme)?.hint}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span id="plus-shelf-colour" className="text-sm font-medium">Shelf card colour</span>
          <p className="-mt-1 text-xs text-muted-foreground">Covers without art and progress bars on your shelf. Your profile colour stays as it is.</p>
          <ColourSwatches value={shelfColour ?? toHex(user.favColour ?? "") ?? DEFAULT_COLOUR} onChange={(c) => save({ shelfCardColour: c })} labelledBy="plus-shelf-colour" disabled={busy || !canPersonalise} />
          {shelfColour && canPersonalise && (
            <button type="button" disabled={busy} onClick={() => save({ shelfCardColour: null })} className="self-start text-xs font-medium underline-offset-4 hover:underline disabled:opacity-60">
              Use my profile colour
            </button>
          )}
        </div>
      </div>
      {!canPersonalise && <UpgradePrompt feature="personalisation" />}
    </div>
  )
}

export default PlusSettings
