"use client"
import { FC, useState } from 'react'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { planOf } from '@/lib/entitlements'
import useUser from '@/app/hooks/useUser'

const OPTIONS = [{ label: "Free", plus: false }, { label: "Plus", plus: true }]

// Dev-only switch for your own account's plan. Unlike the tier preview this writes to the database
// (the dev one), so every Plus gate, server and client, sees it.
const PlanPreviewControls: FC = () => {
  const router = useRouter()
  const { user, mutate } = useUser()
  const [saving, setSaving] = useState(false)
  const isPlus = user ? planOf(user) === "PLUS" : null

  const setPlan = async (plus: boolean) => {
    setSaving(true)
    try {
      await axios.post('/api/dev/plan', { plus })
      await mutate()
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
      <h2 className="font-semibold">My plan</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Puts your account on Bookmark Plus or back on free, without Stripe. This changes your account in the dev database, so it stays until you switch it back. Going to free also clears lifetime and free months.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Plan">
        {OPTIONS.map((o) => {
          const active = isPlus === o.plus
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={saving || isPlus === null}
              onClick={() => !active && setPlan(o.plus)}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                active ? "bg-foreground text-background border-foreground" : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default PlanPreviewControls
