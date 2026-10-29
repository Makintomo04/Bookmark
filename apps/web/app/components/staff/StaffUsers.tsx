"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Check, Copy, ExternalLink, Loader2, Search } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { cn } from '@/lib/utils'
import { ROLE_LABELS, ROLES, SUSPENSION_DURATIONS, type Role, type SuspensionDuration } from '@/lib/roles'
import { COMP_GRANTS, type CompGrant } from '@/lib/entitlements'
import type { StaffUser } from '@/lib/staffUsers'
import type { StaffNoteView } from '@/lib/staffNotes'
import { STAFF_NOTES_ADMIN_ONLY } from '@/lib/staffNoteRules'
import { adminConfirmWord, ROLE_FILTERS, SEARCH_MAX, SEARCH_PAGE, STAFF_NOTE_MAX, APPEAL_SUMMARY_MAX, type AppealDecision, type RoleFilter } from '@/lib/staffUserRules'
import { Button } from '../ui/button'
import { ClearableInput } from '@/app/components/ui/clearable-input'
import { cardClass, fieldClass, formatDate, staffSend } from './staffApi'

const SUSPENSION_LABELS: Record<SuspensionDuration, string> = { '1d': '1 day', '7d': '7 days', '30d': '30 days', indefinite: 'Until lifted' }
const GRANT_LABELS: Record<CompGrant, string> = { '1m': '1 month', '3m': '3 months', '6m': '6 months', '1y': '1 year', indefinite: 'No end date' }
const STORE_LABELS: Record<string, string> = { APP_STORE: 'App Store', PLAY_STORE: 'Google Play' }
const FILTER_LABELS: Record<RoleFilter, string> = { all: 'All', LIBRARIAN: 'Librarians', ADMIN: 'Admins', READER: 'Readers' }

// One pill per source of Plus, so free months on top of a paid plan show too.
const plusPill = (s: StaffUser['plusSources'][number], store: string | null) => {
  switch (s.source) {
    case 'subscription': return 'Plus (Stripe)'
    case 'store': return `Plus (${(store && STORE_LABELS[store]) || 'app store'})${s.until ? `, until ${formatDate(s.until)}` : ''}`
    case 'lifetime': return 'Plus (lifetime)'
    case 'comp': return s.indefinite ? 'Free Plus, no end date' : `Free Plus, until ${formatDate(s.until)}`
  }
}

// "4 Dec", with the year only when it isn't this one.
const shortDate = (iso: string) => {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)

// One line on how they've behaved: reports against them, what was taken down, and suspensions.
const trackRecordLine = (t: NonNullable<StaffUser['trackRecord']>) => {
  if (!t.reported && !t.takenDown && !t.suspensions) return 'Clean record: never reported or suspended'
  const parts = [t.reported ? `Reported ${times(t.reported)}${t.takenDown ? ` (${t.takenDown} upheld)` : ''}` : 'Never reported']
  parts.push(t.suspensions
    ? `suspended ${times(t.suspensions)}${t.lastSuspendedAt ? `, last on ${shortDate(t.lastSuspendedAt)}` : ''}`
    : 'never suspended')
  return parts.join(', ')
}

const pillClass = 'rounded-full px-2 py-0.5'
const panelClass = 'mt-4 flex flex-col gap-3 rounded-md bg-neutral-50 dark:bg-neutral-900 p-3'
const noteClass = 'rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm px-3 py-2'
const linkClass = 'inline-flex items-center gap-1 min-h-11 pointer-fine:min-h-0 text-brand-text hover:underline'

interface Props {
  viewerId: string
  initialQuery: string
  // From /staff/users?appeals=open: readers with an appeal waiting (admins).
  initialAppeals: boolean
  canSuspend: boolean
  canGrant: boolean
  canAssign: boolean
  canViewLog: boolean
}

interface SearchResult { users: StaffUser[], hasMore: boolean }

// Find a reader by username, display name or id (and email, for admins), and act on their account.
// The role filter turns it into a list of the team.
const StaffUsers = ({ viewerId, initialQuery, initialAppeals, canSuspend, canGrant, canAssign, canViewLog }: Props) => {
  const [query, setQuery] = useState(initialQuery)
  const [debounced, setDebounced] = useState(initialQuery)
  const [role, setRole] = useState<RoleFilter>('all')
  const [appeals, setAppeals] = useState(initialAppeals && canSuspend)
  const [limit, setLimit] = useState(SEARCH_PAGE)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])
  // A new search starts from the first page again.
  useEffect(() => setLimit(SEARCH_PAGE), [debounced, role, appeals])

  const params = new URLSearchParams({ q: debounced, role, limit: String(limit) })
  if (appeals) params.set('appeals', 'open')
  const { data, error, isLoading, isValidating, mutate } = useSWR<SearchResult>(`/api/staff/users?${params}`, fetcher, { keepPreviousData: true })

  return (
    <div className="flex flex-col gap-4">
      {appeals ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">Readers with an appeal waiting</p>
          <button type="button" className={`${linkClass} text-sm`} onClick={() => setAppeals(false)}>Show everyone</button>
        </div>
      ) : (
        <>
          <label className="relative block">
            <span className="sr-only">Search readers</span>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <ClearableInput className={`${fieldClass} pl-9 h-10`} placeholder={canSuspend ? 'Username, name, email or id' : 'Username, name or id'} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </label>
          <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Show by role">
            {ROLE_FILTERS.map((r) => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}
                className={cn('inline-flex h-11 pointer-fine:h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium transition',
                  role === r ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900')}>
                {FILTER_LABELS[r]}
              </button>
            ))}
          </div>
          {!debounced && <p className="text-sm text-muted-foreground">Newest accounts first.</p>}
        </>
      )}
      {isLoading && !data && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && data.users.length === 0 && <p className="text-muted-foreground">{appeals ? 'No appeals waiting.' : 'No one matches that.'}</p>}
      {data?.users.map((u) => (
        <UserCard key={u.id} user={u} isSelf={u.id === viewerId} canSuspend={canSuspend} canGrant={canGrant} canAssign={canAssign} canViewLog={canViewLog}
          onChange={(next) => mutate((page) => page && { ...page, users: page.users.map((x) => (x.id === next.id ? next : x)) }, { revalidate: false })} />
      ))}
      {data?.hasMore && limit < SEARCH_MAX && (
        <div>
          <Button size="sm" variant="outline" disabled={isValidating} onClick={() => setLimit((n) => Math.min(SEARCH_MAX, n + SEARCH_PAGE))}>
            {isValidating && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Show more
          </Button>
        </div>
      )}
      {data?.hasMore && limit >= SEARCH_MAX && <p className="text-sm text-muted-foreground">That&apos;s the first {SEARCH_MAX}. Search for someone to narrow it down.</p>}
    </div>
  )
}

type Panel = 'suspend' | 'lift' | 'plus' | 'revoke' | 'role' | 'notes' | 'appeal' | 'decide'

const UserCard = ({ user, isSelf, canSuspend, canGrant, canAssign, canViewLog, onChange }: {
  user: StaffUser, isSelf: boolean, canSuspend: boolean, canGrant: boolean, canAssign: boolean, canViewLog: boolean, onChange: (u: StaffUser) => void
}) => {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState<SuspensionDuration>('7d')
  const [grant, setGrant] = useState<CompGrant>('1m')
  const [nextRole, setNextRole] = useState<Role>(user.role)
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [decision, setDecision] = useState<AppealDecision>('UPHELD')
  const [copied, setCopied] = useState(false)

  // Admins and your own account are changed outside the console (scripts/set-role.ts).
  const protectedAccount = isSelf || user.role === 'ADMIN'
  const handle = user.username ? `@${user.username}` : 'this account'
  const confirmWord = adminConfirmWord(user)

  const open = (next: Panel | null) => {
    setPanel(next)
    setError(null)
    setReason('')
    setConfirm('')
    if (next !== 'role') setNextRole(user.role)
  }
  const toggle = (next: Panel) => open(panel === next ? null : next)

  const run = async (call: () => Promise<StaffUser>) => {
    setPending(true)
    setError(null)
    try {
      const updated = await call()
      onChange(updated)
      setPanel(null)
      setReason('')
      setConfirm('')
      setNextRole(updated.role)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }
  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the id is in the Stripe link's title too.
    }
  }
  const base = `/api/staff/users/${user.id}`
  const spinner = pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />
  const name = user.displayName || user.name
  const billing = user.billing
  const appeal = user.openAppeal
  // Notes on a librarian or admin are for admins (lib/staffNoteRules.ts); the server checks too.
  const mayNote = user.role === 'READER' || canSuspend

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">
            {user.username ? <Link href={`/u/${user.username}`} className="hover:underline underline-offset-2">@{user.username}</Link> : '(no username yet)'}
            {name && <span className="ml-2 font-normal text-muted-foreground">{name}</span>}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {user.email && `${user.email} · `}joined {formatDate(user.createdAt)}{user.hasStripe && !billing && ' · has a Stripe account'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-medium">
          {user.role !== 'READER' && <span className={`${pillClass} bg-brand-fill/15 text-brand-text`}>{ROLE_LABELS[user.role]}</span>}
          {user.plusSources.length === 0 && <span className={`${pillClass} bg-neutral-100 dark:bg-neutral-800`}>Free</span>}
          {user.plusSources.map((s) => <span key={s.source} className={`${pillClass} bg-neutral-100 dark:bg-neutral-800`}>{plusPill(s, user.store)}</span>)}
          {billing?.foundingMember && <span className={`${pillClass} bg-neutral-100 dark:bg-neutral-800`}>Founding member</span>}
          {user.suspended && <span className={`${pillClass} bg-destructive/15 text-destructive`}>Suspended{user.suspendedUntil ? ` until ${formatDate(user.suspendedUntil)}` : ''}</span>}
          {appeal && <span className={`${pillClass} bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200`}>Appeal waiting</span>}
        </div>
      </div>
      {billing && (billing.renewsAt || billing.endsAt || billing.trialEndsAt || billing.stripeCustomerId) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          {billing.trialEndsAt && <span>Trial ends {shortDate(billing.trialEndsAt)}</span>}
          {billing.renewsAt && <span>Renews {shortDate(billing.renewsAt)}</span>}
          {billing.endsAt && <span>Cancelled, ends {shortDate(billing.endsAt)}</span>}
          {billing.stripeUrl && billing.stripeCustomerId && (
            <>
              <a href={billing.stripeUrl} target="_blank" rel="noopener noreferrer" className={linkClass} title={billing.stripeCustomerId}>
                Open in Stripe <ExternalLink size={12} aria-hidden />
              </a>
              <button type="button" className={linkClass} onClick={() => copyId(billing.stripeCustomerId!)}>
                {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                <span aria-live="polite">{copied ? 'Copied' : 'Copy customer id'}</span>
              </button>
            </>
          )}
        </p>
      )}
      {user.trackRecord && <p className="mt-1 text-sm text-muted-foreground">{trackRecordLine(user.trackRecord)}.</p>}
      {user.suspended && user.suspensionReason && <p className="mt-2 text-sm text-muted-foreground">Reason: {user.suspensionReason}</p>}

      {appeal && canSuspend && (
        <div className={panelClass}>
          <p className="text-sm">
            <span className="font-medium">Appeal</span>
            <span className="text-muted-foreground">, logged {formatDate(appeal.createdAt)}{appeal.openedBy && ` by @${appeal.openedBy}`}</span>
          </p>
          <p className="text-sm whitespace-pre-line">{appeal.summary}</p>
          {panel !== 'decide' && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { open('decide'); setDecision('UPHELD') }}>Uphold</Button>
              <Button size="sm" variant="outline" onClick={() => { open('decide'); setDecision('REJECTED') }}>Reject</Button>
            </div>
          )}
          {panel === 'decide' && (
            <form className="flex flex-col gap-3" onSubmit={(e) => {
              e.preventDefault()
              void run(() => staffSend(`${base}/appeals/${appeal.id}`, 'PUT', { decision, note: reason }))
            }}>
              <p className="text-sm">
                {decision === 'UPHELD'
                  ? `Upholding lifts ${handle}'s suspension now, and it's logged as a lift too.`
                  : 'Rejecting keeps the suspension as it is.'}
                {' '}The admin who logged it doesn&apos;t decide it, unless they&apos;re the only admin.
              </p>
              <textarea className={fieldClass} rows={2} placeholder="Note on the decision (kept with the appeal and in the staff log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required autoFocus />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={decision === 'REJECTED' ? 'destructive' : 'default'} disabled={pending || !reason.trim()}>
                  {spinner}{decision === 'UPHELD' ? 'Uphold and lift' : 'Reject appeal'}
                </Button>
                <Button size="sm" type="button" variant="ghost" onClick={() => open(null)}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canSuspend && !protectedAccount && (user.suspended
          ? <Button size="sm" variant={panel === 'lift' ? 'secondary' : 'outline'} onClick={() => toggle('lift')}>Lift suspension</Button>
          : <Button size="sm" variant={panel === 'suspend' ? 'secondary' : 'outline'} onClick={() => toggle('suspend')}>Suspend</Button>)}
        {canSuspend && user.suspended && !appeal && (
          <Button size="sm" variant={panel === 'appeal' ? 'secondary' : 'outline'} onClick={() => toggle('appeal')}>Log an appeal</Button>
        )}
        {canGrant && <Button size="sm" variant={panel === 'plus' ? 'secondary' : 'outline'} onClick={() => toggle('plus')}>Give Plus</Button>}
        {canGrant && user.compActive && (
          <Button size="sm" variant={panel === 'revoke' ? 'secondary' : 'ghost'} onClick={() => toggle('revoke')}>Remove free Plus</Button>
        )}
        {mayNote && (
          <Button size="sm" variant={panel === 'notes' ? 'secondary' : 'ghost'} onClick={() => toggle('notes')}>
            Notes{user.noteCount > 0 && <span className="ml-1 tabular-nums text-muted-foreground">{user.noteCount}</span>}
          </Button>
        )}
        {canAssign && !protectedAccount && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Role</span>
            <select className="h-11 pointer-fine:h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" value={nextRole} disabled={pending}
              onChange={(e) => {
                const role = e.target.value as Role
                open(role === user.role ? null : 'role')
                setNextRole(role)
              }}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </label>
        )}
        {canViewLog && <Link href={`/staff/log?target=${user.id}`} className="inline-flex items-center min-h-11 pointer-fine:min-h-0 text-sm text-brand-text hover:underline">History</Link>}
      </div>
      {(canSuspend || canAssign) && protectedAccount && (
        <p className="mt-2 text-sm text-muted-foreground">
          {isSelf ? 'This is you. Another admin changes your account, outside the console.' : 'Admins are changed by another admin outside the console.'}
        </p>
      )}
      {canGrant && isSelf && <p className="mt-1 text-sm text-muted-foreground">You can give yourself Plus. It&apos;s logged like any other grant.</p>}
      {!mayNote && <p className="mt-2 text-sm text-muted-foreground">{STAFF_NOTES_ADMIN_ONLY}</p>}

      {panel === 'notes' && mayNote && (
        <NotesPanel userId={user.id} onCount={(noteCount) => noteCount !== user.noteCount && onChange({ ...user, noteCount })} />
      )}

      {panel === 'appeal' && (
        <form className={panelClass} onSubmit={(e) => {
          e.preventDefault()
          void run(() => staffSend(`${base}/appeals`, 'POST', { summary: reason }))
        }}>
          <p className="text-sm">Log what {handle} sent support asking for the suspension to be lifted. An admin then upholds or rejects it.</p>
          <textarea className={fieldClass} rows={3} placeholder="What they're appealing, and why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={APPEAL_SUMMARY_MAX} required />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || !reason.trim()}>{spinner}Log appeal</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => open(null)}>Cancel</Button>
          </div>
        </form>
      )}

      {panel === 'suspend' && (
        <form className={panelClass} onSubmit={(e) => {
          e.preventDefault()
          void run(() => staffSend(`${base}/suspend`, 'POST', { duration, reason }))
        }}>
          <p className="text-sm">Signs them out on the web and in the app, and hides their profile, lists, reviews and circle comments until it ends. They&apos;re told when it ends and the reason you give.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(Object.keys(SUSPENSION_DURATIONS) as SuspensionDuration[]).map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm min-h-11 pointer-fine:min-h-0">
                <input type="radio" name={`duration-${user.id}`} checked={duration === d} onChange={() => setDuration(d)} /> {SUSPENSION_LABELS[d]}
              </label>
            ))}
          </div>
          <textarea className={fieldClass} rows={2} placeholder="Reason (they'll see it, and it's kept in the staff log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
          <div><Button size="sm" variant="destructive" disabled={pending || !reason.trim()}>{spinner}Suspend {handle}</Button></div>
        </form>
      )}

      {panel === 'lift' && (
        <form className={panelClass} onSubmit={(e) => {
          e.preventDefault()
          void run(() => staffSend(`${base}/suspend`, 'DELETE', { reason }))
        }}>
          <p className="text-sm">They can sign in again straight away, and their profile, lists, reviews and comments come back.</p>
          <textarea className={fieldClass} rows={2} placeholder="Why you're lifting it (kept in the staff log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || !reason.trim()}>{spinner}Lift suspension</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => open(null)}>Cancel</Button>
          </div>
        </form>
      )}

      {panel === 'plus' && (
        <form className={panelClass} onSubmit={(e) => {
          e.preventDefault()
          void run(() => staffSend(`${base}/plus`, 'POST', { grant, note: reason }))
        }}>
          <p className="text-sm">Free Plus with no payment. Added to any free Plus they already have; paid plans aren&apos;t touched.</p>
          {user.paysForPlus && (
            <p role="note" className={noteClass}>
              {handle} already has paid Plus. Free months run alongside it: they don&apos;t pause or refund what they pay. To give money back, refund in Stripe or the app store instead.
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(Object.keys(COMP_GRANTS) as CompGrant[]).map((g) => (
              <label key={g} className="flex items-center gap-1.5 text-sm min-h-11 pointer-fine:min-h-0">
                <input type="radio" name={`grant-${user.id}`} checked={grant === g} onChange={() => setGrant(g)} /> {GRANT_LABELS[g]}
              </label>
            ))}
          </div>
          <ClearableInput className={fieldClass} placeholder="Why (optional, for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div><Button size="sm" disabled={pending}>{spinner}{user.paysForPlus ? 'Give Plus anyway' : 'Give Plus'}</Button></div>
        </form>
      )}

      {panel === 'revoke' && (
        <form className={panelClass} onSubmit={(e) => {
          e.preventDefault()
          void run(() => staffSend(`${base}/plus`, 'DELETE', { note: reason }))
        }}>
          <p className="text-sm">Ends their free Plus now{user.compIndefinite ? '' : `, rather than on ${formatDate(user.compPlusUntil)}`}. Paid plans aren&apos;t touched.</p>
          <ClearableInput className={fieldClass} placeholder="Why (optional, for the log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" disabled={pending}>{spinner}Remove free Plus</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => open(null)}>Cancel</Button>
          </div>
        </form>
      )}

      {panel === 'role' && nextRole !== user.role && (
        <form className={panelClass} onSubmit={(e) => {
          e.preventDefault()
          void run(() => staffSend(`${base}/role`, 'PUT', { role: nextRole, reason, confirm }))
        }}>
          <p className="text-sm">Change {handle} from {ROLE_LABELS[user.role]} to {ROLE_LABELS[nextRole]}?</p>
          {nextRole === 'ADMIN' && (
            <p role="note" className={noteClass}>
              Admins can do everything here, including suspending readers and changing roles. This can&apos;t be undone in the console: only another admin, outside it, can take it away.
            </p>
          )}
          <textarea className={fieldClass} rows={2} placeholder="Reason (kept in the staff log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
          {nextRole === 'ADMIN' && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span>Type <span className="font-semibold">{confirmWord}</span> to confirm</span>
              <ClearableInput className={fieldClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={nextRole === 'ADMIN' ? 'destructive' : 'default'}
              disabled={pending || !reason.trim() || (nextRole === 'ADMIN' && confirm.trim().replace(/^@/, '').toLowerCase() !== confirmWord.toLowerCase())}>
              {spinner}Make them {ROLE_LABELS[nextRole]}
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => open(null)}>Cancel</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </article>
  )
}

// The team's notes on an account, newest first, and a box to add one. The reader never sees them.
const NotesPanel = ({ userId, onCount }: { userId: string, onCount: (count: number) => void }) => {
  const url = `/api/staff/users/${userId}/notes`
  const { data, error, isLoading, mutate } = useSWR<StaffNoteView[]>(url, fetcher)
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  useEffect(() => {
    if (data) onCount(data.length)
    // Only when the notes change, not when the card re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const add = async () => {
    setPending(true)
    setSendError(null)
    try {
      const notes = await staffSend<StaffNoteView[]>(url, 'POST', { body })
      await mutate(notes, { revalidate: false })
      setBody('')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={panelClass}>
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void add() }}>
        <textarea className={fieldClass} rows={2} placeholder="Add a note for the team (they never see it)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={STAFF_NOTE_MAX} required />
        <div><Button size="sm" disabled={pending || !body.trim()}>{pending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden />}Add note</Button></div>
        {sendError && <p role="alert" className="text-sm text-destructive">{sendError}</p>}
      </form>
      {isLoading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
      {data && data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {data.map((n) => (
            <li key={n.id} className="text-sm">
              <p className="whitespace-pre-line">{n.body}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{n.author ? `@${n.author}` : 'A deleted account'}, {formatDate(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default StaffUsers
