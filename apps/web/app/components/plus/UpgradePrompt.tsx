import { FC } from 'react'
import Link from 'next/link'
import { ArrowRight, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FEATURE_COPY, UPGRADE_URL, type AllowanceKey, type EntitlementKey } from '@/lib/entitlements'

interface UpgradePromptProps {
  feature: EntitlementKey | AllowanceKey
  // A bordered card where the feature would be, or one line to sit under a refusal.
  variant?: 'card' | 'inline'
  // Replaces the feature's standard message.
  message?: string
  className?: string
}

// What a gated feature shows a free account. The server still refuses with a 402 (lib/entitlementsServer.ts);
// this only explains and points at /plus. No "use client", so server components can render it too.
const UpgradePrompt: FC<UpgradePromptProps> = ({ feature, variant = 'card', message, className }) => {
  const copy = FEATURE_COPY[feature]

  if (variant === 'inline') {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        {message ?? copy.message}{' '}
        <Link href={UPGRADE_URL} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
          See Bookmark Plus <ArrowRight size={14} aria-hidden />
        </Link>
      </span>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
          <Crown size={16} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold">{copy.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{message ?? copy.message}</p>
        </div>
      </div>
      <Link
        href={UPGRADE_URL}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-brand-fill px-4 text-sm font-semibold text-white transition hover:bg-brand-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        See Bookmark Plus <ArrowRight size={14} aria-hidden />
      </Link>
    </div>
  )
}

export default UpgradePrompt
