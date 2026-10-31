import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import getCurrentUser from '@/app/actions/getCurrentUser'
import { cardClass } from '@/app/components/staff/staffApi'
import { can } from '@/lib/roles'
import { oldestOpenReportAt, openAppeals, reportCounts, staffActivity } from '@/lib/staffOverview'
import { REPORT_KINDS, timeAgo, type ReportKind } from '@/lib/staffReportRules'

const KIND_COUNTS: Record<ReportKind, [string, string]> = {
  list: ['list', 'lists'], comment: ['comment', 'comments'], review: ['review', 'reviews'], book: ['book', 'books'],
}

const tileClass = `${cardClass} group flex flex-col gap-1 transition hover:bg-neutral-50 dark:hover:bg-neutral-900`

// The overview: what's waiting in the reports queue, and for admins, appeals to decide and who's been
// doing what.
// The layout has already turned readers away.
const Page = async () => {
  const user = await getCurrentUser()
  if (!can(user, 'reports.review')) return <p className="text-muted-foreground">Nothing to look at here yet.</p>

  const [counts, oldestOpenAt, activity, appeals] = await Promise.all([
    reportCounts(), oldestOpenReportAt(), can(user, 'staff.log') ? staffActivity() : null,
    can(user, 'users.suspend') ? openAppeals() : null,
  ])
  const byKind = REPORT_KINDS.filter((kind) => counts.open[kind] > 0)
    .map((kind) => `${counts.open[kind]} ${KIND_COUNTS[kind][counts.open[kind] === 1 ? 0 : 1]}`)

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="overview-reports">
        <h2 id="overview-reports" className="font-semibold">Reports</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Link href="/staff/reports" className={tileClass}>
            <span className="flex items-center justify-between text-sm text-muted-foreground">
              Open <ChevronRight size={16} className="transition group-hover:translate-x-0.5" aria-hidden />
            </span>
            <span className="text-3xl font-semibold tabular-nums">{counts.openTotal}</span>
            <span className="text-sm text-muted-foreground">{byKind.length ? byKind.join(', ') : 'Nothing waiting'}</span>
          </Link>
          <Link href="/staff/reports?view=escalated" className={tileClass}>
            <span className="flex items-center justify-between text-sm text-muted-foreground">
              Escalated <ChevronRight size={16} className="transition group-hover:translate-x-0.5" aria-hidden />
            </span>
            <span className="text-3xl font-semibold tabular-nums">{counts.escalated}</span>
            <span className="text-sm text-muted-foreground">{can(user, 'users.suspend') ? 'Waiting for you' : 'Waiting for an admin'}</span>
          </Link>
          <Link href="/staff/reports" className={tileClass}>
            <span className="flex items-center justify-between text-sm text-muted-foreground">
              Oldest open <ChevronRight size={16} className="transition group-hover:translate-x-0.5" aria-hidden />
            </span>
            <span className="text-3xl font-semibold tabular-nums">{oldestOpenAt ? timeAgo(oldestOpenAt).replace(' ago', '') : '–'}</span>
            <span className="text-sm text-muted-foreground">{oldestOpenAt ? 'Since it was reported' : 'Nothing waiting'}</span>
          </Link>
        </div>
      </section>

      {appeals && (
        <section aria-labelledby="overview-readers">
          <h2 id="overview-readers" className="font-semibold">Readers</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Link href="/staff/users?appeals=open" className={tileClass}>
              <span className="flex items-center justify-between text-sm text-muted-foreground">
                Appeals waiting <ChevronRight size={16} className="transition group-hover:translate-x-0.5" aria-hidden />
              </span>
              <span className="text-3xl font-semibold tabular-nums">{appeals.count}</span>
              <span className="text-sm text-muted-foreground">{appeals.oldestAt ? `Oldest logged ${timeAgo(appeals.oldestAt)}` : 'Nothing to decide'}</span>
            </Link>
          </div>
        </section>
      )}

      {activity && (
        <section aria-labelledby="overview-activity">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="overview-activity" className="font-semibold">Staff activity</h2>
            <Link href="/staff/log" className="text-sm text-brand-text hover:underline">See the log</Link>
          </div>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nobody has done anything this week yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th scope="col" className="py-2 font-medium">Who</th>
                  <th scope="col" className="py-2 font-medium text-right">Today</th>
                  <th scope="col" className="py-2 font-medium text-right">This week</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.actorId} className="border-b border-neutral-200 dark:border-neutral-800 last:border-0">
                    <td className="py-2">
                      {a.username
                        ? <Link href={`/staff/users?q=${a.actorId}`} className="text-brand-text hover:underline">@{a.username}</Link>
                        : <span className="text-muted-foreground">A deleted account</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{a.today}</td>
                    <td className="py-2 text-right tabular-nums">{a.week}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Today from midnight UTC, the week from Monday.</p>
        </section>
      )}
    </div>
  )
}

export default Page
