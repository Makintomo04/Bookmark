"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2, Search } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { ROLE_LABELS, ROLES, SUSPENSION_DURATIONS, type Role, type SuspensionDuration } from '@/lib/roles'
import { COMP_GRANTS, type CompGrant } from '@/lib/entitlements'
import type { StaffUser } from '@/lib/staffUsers'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass, formatDate, staffSend } from './staffApi'

const SUSPENSION_LABELS: Record<SuspensionDuration, string> = { '1d': '1 day', '7d': '7 days', '30d': '30 days', indefinite: 'Until lifted' }
const GRANT_LABELS: Record<CompGrant, string> = { '1m': '1 month', '1y': '1 year', indefinite: 'No end date' }
const PLUS_LABELS: Record<NonNullable<StaffUser['plusSource']>, string> = {
  subscription: 'Plus (Stripe)', store: 'Plus (app store)', lifetime: 'Plus (lifetime)', comp: 'Plus (complimentary)',
}

interface Props {
  viewerId: string
  initialQuery: string
  canSuspend: boolean
  canGrant: boolean
  canAssign: boolean
}

// Find a reader by username, email, name or id, and act on their account.
const StaffUsers = ({ viewerId, initialQuery, canSuspend, canGrant, canAssign }: Props) => {
  const [query, setQuery] = useState(initialQuery)
  const [debounced, setDebounced] = useState(initialQuery)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])
  const { data, error, isLoading, mutate } = useSWR<StaffUser[]>(`/api/staff/users?q=${encodeURIComponent(debounced)}`, fetcher, { keepPreviousData: true })

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search readers</span>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <ClearableInput className={`${fieldClass} pl-9 h-10`} placeholder="Username, email, name or id" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </label>
      {!debounced && <p className="text-sm text-muted-foreground">Newest accounts first.</p>}
      {isLoading && !data && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && data.length === 0 && <p className="text-muted-foreground">No one matches that.</p>}
      {data?.map((u) => (
        <UserCard key={u.id} user={u} isSelf={u.id === viewerId} canSuspend={canSuspend} canGrant={canGrant} canAssign={canAssign}
          onChange={(next) => mutate((list) => list?.map((x) => (x.id === next.id ? next : x)), { revalidate: false })} />
      ))}
    </div>
  )
}

const UserCard = ({ user, isSelf, canSuspend, canGrant, canAssign, onChange }: {
  user: StaffUser, isSelf: boolean, canSuspend: boolean, canGrant: boolean, canAssign: boolean, onChange: (u: StaffUser) => void
}) => {
  const [panel, setPanel] = useState<'suspend' | 'plus' | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState<SuspensionDuration>('7d')
  const [grant, setGrant] = useState<CompGrant>('1m')
  const [reason, setReason] = useState('')

  // Admins and your own account are changed outside the console (scripts/set-role.ts).
  const protectedAccount = isSelf || user.role === 'ADMIN'

  const run = async (call: () => Promise<StaffUser>) => {
    setPending(true)
    setError(null)
    try {
      onChange(await call())
      setPanel(null)
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }
  const base = `/api/staff/users/${user.id}`

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">
            {user.username ? <Link href={`/u/${user.username}`} className="hover:underline underline-offset-2">@{user.username}</Link> : '(no username yet)'}
            {user.name && <span className="ml-2 font-normal text-muted-foreground">{user.name}</span>}
          </p>
          <p className="text-sm text-muted-foreground truncate">{user.email} · joined {formatDate(user.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-medium">
          {user.role !== 'READER' && <span className="rounded-full bg-brand-fill/15 text-brand-text px-2 py-0.5">{ROLE_LABELS[user.role]}</span>}
          <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5">
            {user.plusSource ? PLUS_LABELS[user.plusSource] : 'Free'}
            {user.plusSource === 'comp' && (user.compIndefinite ? ', no end date' : `, until ${formatDate(user.compPlusUntil)}`)}
          </span>
          {user.suspended && <span className="rounded-full bg-destructive/15 text-destructive px-2 py-0.5">Suspended{user.suspendedUntil ? ` until ${formatDate(user.suspendedUntil)}` : ''}</span>}
        </div>
      </div>
      {user.suspended && user.suspensionReason && <p className="mt-2 text-sm text-muted-foreground">Reason: {user.suspensionReason}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canSuspend && !protectedAccount && (user.suspended
          ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => staffSend(`${base}/suspend`, 'DELETE', {}))}>Lift suspension</Button>
          : <Button size="sm" variant={panel === 'suspend' ? 'secondary' : 'outline'} onClick={() => setPanel(panel === 'suspend' ? null : 'suspend')}>Suspend</Button>)}
        {canGrant && <Button size="sm" variant={panel === 'plus' ? 'secondary' : 'outline'} onClick={() => setPanel(panel === 'plus' ? null : 'plus')}>Give Plus</Button>}
        {canGrant && user.compPlusUntil && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => staffSend(`${base}/plus`, 'DELETE', {}))}>Remove free Plus</Button>
        )}
        {canAssign && !protectedAccount && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Role</span>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" value={user.role} disabled={pending}
              onChange={(e) => run(() => staffSend(`${base}/role`, 'PUT', { role: e.target.value as Role }))}>
              {ROLES.filter((r) => r !== 'ADMIN').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              <option value="ADMIN">{ROLE_LABELS.ADMIN} (can&apos;t be undone here)</option>
            </select>
          </label>
        )}
        <Link href={`/staff/log?target=${user.id}`} className="text-sm text-brand-text hover:underline">History</Link>
      </div>

      {panel === 'suspend' && (
        <form className="mt-4 flex flex-col gap-3 rounded-md bg-neutral-50 dark:bg-neutral-900 p-3" onSubmit={(e) => {
          e.preventDefault()
          void run(() => staffSend(`${base}/suspend`, 'POST', { duration, reason }))
        }}>
          <p className="text-sm">Signs them out on the web and in the app, and hides their profile and lists until it ends.</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SUSPENSION_DURATIONS) as SuspensionDuration[]).map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <input type="radio" name={`duration-${user.id}`} checked={duration === d} onChange={() => setDuration(d)} /> {SUSPENSION_LABELS[d]}
              </label>
            ))}
          </div>
          <textarea className={fieldClass} rows={2} placeholder="Reason (kept in the staff log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
          <div><Button size="sm" variant="destructive" disabled={pending || !reason.trim()}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Suspend @{user.username}</Button></div>
        </form>
      )}

      {panel === 'plus' && (
        <form className="mt-4 flex flex-col gap-3 rounded-md bg-neutral-50 dark:bg-neutral-900 p-3" onSubmit={(e) => {
          e.preventDefault()
          void run(() => staffSend(`${base}/plus`, 'POST', { grant, note: reason }))
        }}>
          <p className="text-sm">Free Plus with no payment. Added to any free Plus they already have; paid plans aren&apos;t touched.</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(COMP_GRANTS) as CompGrant[]).map((g) => (
              <label key={g} className="flex items-center gap-1.5 text-sm">
                <input type="radio" name={`grant-${user.id}`} checked={grant === g} onChange={() => setGrant(g)} /> {GRANT_LABELS[g]}
              </label>
            ))}
          </div>
          <ClearableInput className={fieldClass} placeholder="Why (optional, for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div><Button size="sm" disabled={pending}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Give Plus</Button></div>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </article>
  )
}

export default StaffUsers
