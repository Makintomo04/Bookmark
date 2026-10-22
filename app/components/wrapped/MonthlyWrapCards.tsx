"use client"
import { FC, useMemo, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import UpgradePrompt from '../plus/UpgradePrompt'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const button = 'inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400'

// The last twelve months, newest first, in the browser's calendar.
function recentMonths(now = new Date()) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
  })
}

// Monthly Wrap share cards (Plus): pick a month, get the 1080×1920 story image from /api/wrap/monthly,
// which checks the plan itself. Free accounts see what it is and where to get it.
const MonthlyWrapCards: FC<{ allowed: boolean }> = ({ allowed }) => {
  const months = useMemo(() => recentMonths(), [])
  const [picked, setPicked] = useState(0)

  if (!allowed) return <UpgradePrompt feature="monthlyWrapCards" />

  const { year, month, label } = months[picked]
  const href = `/api/wrap/monthly?year=${year}&month=${month}`
  const file = `bookmark-wrap-${year}-${String(month).padStart(2, '0')}.png`

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="font-semibold">Monthly Wrap card</p>
        <p className="text-sm text-muted-foreground">One month of reading, ready for your story.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="wrap-month" className="sr-only">Month</label>
        <select
          id="wrap-month"
          value={picked}
          onChange={(e) => setPicked(Number(e.target.value))}
          className="h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {months.map((m, i) => <option key={m.label} value={i}>{m.label}</option>)}
        </select>
        <a href={href} download={file} className={`${button} bg-foreground text-background hover:opacity-90`}>
          <Download size={15} aria-hidden /> Download
        </a>
        <a href={href} target="_blank" rel="noreferrer" aria-label={`Open the ${label} card`} className={`${button} border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900`}>
          <ExternalLink size={15} aria-hidden /> Open
        </a>
      </div>
    </div>
  )
}

export default MonthlyWrapCards
